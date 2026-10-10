// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';
process.env.DOCS_ENCRYPTION_KEY = randomBytes(32).toString('base64');

const { app } = await import('../app');
const { checkLink, decrypt, encrypt, maskIdNumber, signLink, sniffMime, verhoeffValid } = await import('../documents');
const { getDb, schema } = await import('../db/client');

/** A valid Aadhaar-format number: 11 digits plus the Verhoeff check digit. */
function aadhaar(prefix = '23456789012') {
  for (let d = 0; d <= 9; d++) if (verhoeffValid(prefix + d)) return prefix + d;
  throw new Error('no check digit');
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

function client() {
  let cookie = '';
  return async (method: string, path: string, body?: BodyInit, json = true) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}) },
      body,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, res, body: json ? ((await res.json()) as any) : null };
  };
}

async function signedIn(email: string) {
  const api = client();
  const otp = await api('POST', '/auth/otp', JSON.stringify({ contact: email, purpose: 'signup' }));
  await api('POST', '/auth/signup', JSON.stringify({ name: 'Doc', contact: email, code: otp.body.devCode, password: 'password-123' }));
  return api;
}

function form(fields: Record<string, string>, file: Buffer = PDF, name = 'passport.pdf') {
  const f = new FormData();
  f.set('file', new File([file], name));
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe('document security helpers', () => {
  it('encrypts and decrypts, and refuses tampered data', () => {
    const box = encrypt(Buffer.from('secret scan'));
    expect(box.data.toString()).not.toContain('secret');
    expect(decrypt(box).toString()).toBe('secret scan');
    box.data[0] ^= 1;
    expect(() => decrypt(box)).toThrow();
  });

  it('signs links that expire and cannot be reused for another file', () => {
    const now = Date.now();
    const { url } = signLink('doc-a', now);
    const q = new URL(url, 'http://x').searchParams;
    expect(checkLink('doc-a', q.get('exp')!, q.get('sig')!, now)).toBe(true);
    expect(checkLink('doc-b', q.get('exp')!, q.get('sig')!, now)).toBe(false);
    expect(checkLink('doc-a', q.get('exp')!, q.get('sig')!, now + 6 * 60_000)).toBe(false);
  });

  it('reads the real file type', () => {
    expect(sniffMime(PDF)).toBe('application/pdf');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('<html>'))).toBeNull();
  });

  it('checks and masks ID numbers', () => {
    const good = aadhaar();
    expect(maskIdNumber('aadhaar', good)).toEqual({ masked: `XXXX XXXX ${good.slice(8)}` });
    const bad = good.slice(0, 11) + ((Number(good[11]) + 1) % 10);
    expect(maskIdNumber('aadhaar', bad)).toHaveProperty('error');
    expect(maskIdNumber('pan', 'abcde1234f')).toEqual({ masked: 'XXXXXX234F' });
    expect(maskIdNumber('passport', 'Z1234567')).toEqual({ masked: 'XXXX4567' });
  });
});

describe('document API', () => {
  let a: ReturnType<typeof client>;
  let b: ReturnType<typeof client>;
  beforeAll(async () => {
    await app.request('/api/health');
    a = await signedIn('docs-a@example.com');
    b = await signedIn('docs-b@example.com');
  }, 120_000);

  it('uploads encrypted, keeps only the masked number', async () => {
    const number = aadhaar('98765432101');
    const res = await a('POST', '/documents', form({ kind: 'id', idType: 'aadhaar', title: 'Aadhaar', number }));
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ kind: 'id', title: 'Aadhaar', mime: 'application/pdf', maskedNumber: `XXXX XXXX ${number.slice(8)}` });
    // The full number appears nowhere in the stored rows.
    const { db } = await getDb();
    const rows = JSON.stringify(await db.select().from(schema.verificationDocuments));
    expect(rows).not.toContain(number);
    const [blob] = await db.select().from(schema.documentBlobs);
    expect(blob.data.includes(Buffer.from('%PDF'))).toBe(false);
  });

  it('refuses bad files and bad numbers', async () => {
    expect((await a('POST', '/documents', form({ kind: 'other', title: 'Page' }, Buffer.from('<html>hi</html>'), 'x.pdf'))).status).toBe(415);
    const badNo = await a('POST', '/documents', form({ kind: 'id', idType: 'aadhaar', title: 'Aadhaar', number: '123412341234' }));
    expect(badNo.status).toBe(400);
    expect(badNo.body.error.fields.number).toBeTruthy();
    expect((await client()('POST', '/documents', form({ kind: 'other', title: 'x' }))).status).toBe(401);
  });

  it('opens the file through a signed link, only for its owner', async () => {
    const [doc] = (await a('GET', '/documents')).body.documents;
    expect((await b('POST', `/documents/${doc.id}/link`)).status).toBe(404);
    const link = await a('POST', `/documents/${doc.id}/link`);
    expect(link.body.url).toMatch(/^\/api\/files\//);
    const file = await app.request(link.body.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await file.arrayBuffer()).equals(PDF)).toBe(true);
    const forged = link.body.url.replace(/sig=[^&]+/, 'sig=AAAA');
    expect((await app.request(forged)).status).toBe(403);
  });

  it('keeps accounts apart and deletes with the file', async () => {
    expect((await b('GET', '/documents')).body.documents).toHaveLength(0);
    const [doc] = (await a('GET', '/documents')).body.documents;
    expect((await b('DELETE', `/documents/${doc.id}`)).status).toBe(404);
    expect((await a('DELETE', `/documents/${doc.id}`)).status).toBe(200);
    const { db } = await getDb();
    expect(await db.select().from(schema.documentBlobs)).toHaveLength(0);
  });
});
