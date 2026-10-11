// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';
process.env.DOCS_ENCRYPTION_KEY = randomBytes(32).toString('base64');

const { app } = await import('../app');
const { pdfHasTextLayer } = await import('../documents');
const { textPdf } = await import('../pdf');
const { imagesToPdf } = await import('../../src/utils/pdf');
const { containsSensitive } = await import('../../src/engines/redact');

// Smallest valid JPEG (1x1 white) standing in for a burnt-in page image.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const ORIGINAL = textPdf([{ text: 'Aadhaar 2341 2341 2346' }, { text: 'PAN ABCPE1234F' }, { text: 'DOB: 14/08/1990' }] as never);
const MASKED = Buffer.from(imagesToPdf([{ jpeg: new Uint8Array(JPEG), width: 1, height: 1 }]));

let cookie = '';
const req = async (method: string, path: string, body?: BodyInit) => {
  const res = await app.request(`/api${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}) }, body });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return res;
};
const form = (extra: Record<string, Blob | string>) => {
  const f = new FormData();
  f.set('file', new Blob([ORIGINAL], { type: 'application/pdf' }), 'aadhaar.pdf');
  f.set('kind', 'id');
  f.set('idType', 'aadhaar');
  f.set('title', 'Aadhaar');
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};

describe('document masking', () => {
  beforeAll(async () => {
    const otp = (await (await req('POST', '/auth/otp', JSON.stringify({ contact: 'mask@example.com', purpose: 'signup' }))).json()) as { devCode: string };
    await req('POST', '/auth/signup', JSON.stringify({ name: 'Mask', contact: 'mask@example.com', code: otp.devCode, password: 'password-123' }));
  }, 120_000);

  it('the original has extractable sensitive text; the masked copy has none', () => {
    expect(pdfHasTextLayer(ORIGINAL)).toBe(true);
    expect(containsSensitive(ORIGINAL.toString('latin1').replace(/[()]/g, '\n'))).toBe(true);
    expect(pdfHasTextLayer(MASKED)).toBe(false);
    expect(containsSensitive(MASKED.toString('latin1'))).toBe(false);
  });

  it('refuses a "masked" PDF that still has a text layer', async () => {
    const res = await req('POST', '/documents', form({ masked: new Blob([ORIGINAL], { type: 'application/pdf' }), maskSummary: '{"aadhaar":1}' }));
    expect(res.status).toBe(422);
  });

  it('stores the masked copy, serves it by default, and can erase the original', async () => {
    const up = await req('POST', '/documents', form({ masked: new Blob([MASKED], { type: 'application/pdf' }), maskSummary: '{"aadhaar":1,"pan":1,"dob":1}' }));
    expect(up.status).toBe(201);
    const { document } = (await up.json()) as { document: { id: string; maskStatus: string } };
    expect(document.maskStatus).toBe('masked');

    const link = (await (await req('POST', `/documents/${document.id}/link`)).json()) as { url: string; variant: string };
    expect(link.variant).toBe('masked');
    const served = Buffer.from(await (await app.request(link.url)).arrayBuffer());
    expect(served.equals(MASKED)).toBe(true);
    // The masked signature does not open the original.
    expect((await app.request(link.url.replace('&v=masked', ''))).status).toBe(403);

    const orig = (await (await req('POST', `/documents/${document.id}/link?v=original`)).json()) as { url: string };
    expect(Buffer.from(await (await app.request(orig.url)).arrayBuffer()).equals(ORIGINAL)).toBe(true);

    expect((await req('DELETE', `/documents/${document.id}/original`)).status).toBe(200);
    expect((await req('POST', `/documents/${document.id}/link?v=original`)).status).toBe(404);
    expect((await req('POST', `/documents/${document.id}/link`)).status).toBe(200);
  });
});
