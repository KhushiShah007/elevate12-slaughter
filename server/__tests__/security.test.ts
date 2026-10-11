// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';
process.env.WHATSAPP_APP_SECRET = 'wa-test-secret';
process.env.RESEND_API_KEY = 'test-key-not-real';
process.env.EMAIL_FROM = 'demo@example.com';
delete process.env.ALLOW_REAL_OUTBOUND;

const { app } = await import('../app');
const { assertAllowedUrl, safeError } = await import('../security');
const { realSendingAllowed, sendOutbound } = await import('../outbound');

let cookie = '';
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(`http://localhost/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', host: 'localhost', ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, res, body: (await res.clone().json().catch(() => null)) as any };
};

describe('security', () => {
  beforeAll(async () => {
    const otp = await call('POST', '/auth/otp', { contact: 'sec@example.com', purpose: 'signup' });
    const res = await call('POST', '/auth/signup', { name: 'Sec', contact: 'sec@example.com', code: otp.body.devCode, password: 'password-123' });
    cookie = res.res.headers.get('set-cookie')!.split(';')[0];
  }, 120_000);

  it('blocks cross-site state changes but allows same-site ones and signed callbacks', async () => {
    expect((await call('POST', '/notifications/me/read-all', {}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('POST', '/notifications/me/read-all', {}, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await call('POST', '/notifications/me/read-all', {}, { origin: 'http://localhost' })).status).toBe(200);
    expect((await call('GET', '/notifications', undefined, { origin: 'https://evil.example' })).status).toBe(200); // reads are fine
    // Webhooks have no Origin and prove themselves with a signature instead.
    const raw = JSON.stringify({ entry: [] });
    const sig = `sha256=${createHmac('sha256', 'wa-test-secret').update(raw).digest('hex')}`;
    const wa = (s: string) => app.request('/api/whatsapp/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': s }, body: raw });
    expect((await wa('sha256=bad')).status).toBe(403);
    expect((await wa(sig)).status).toBe(200);
  });

  it('sets secure headers and never leaks internals', async () => {
    const r = await call('GET', '/health');
    expect(r.res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.res.headers.get('x-frame-options')).toBeTruthy();
    expect(safeError(new Error('Failed query: select * from users where email = $1 params: asha@example.com,+919820012345'))).not.toMatch(/asha|9820012345/);
    expect(safeError(new Error('connect postgresql://u:pw@h:5432/db failed'))).not.toContain('pw@');
  });

  it('refuses outbound fetches to hosts outside the allowlist (SSRF)', () => {
    expect(() => assertAllowedUrl('https://api.open-meteo.com/v1/forecast')).not.toThrow();
    expect(() => assertAllowedUrl('http://169.254.169.254/latest/meta-data')).toThrow();
    expect(() => assertAllowedUrl('https://evil.example/x')).toThrow();
  });

  it('never sends for real in demo mode, even with a provider key', async () => {
    expect(realSendingAllowed('email')).toBe(false);
    const { getDb, schema } = await import('../db/client');
    const { eq } = await import('drizzle-orm');
    const { db } = await getDb();
    const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, 'sec@example.com'));
    const row = await sendOutbound({ userId: u.id, channel: 'email', to: 'someone@example.com', subject: 'Hi', body: 'Test' });
    expect(row.status).toBe('dry_run');
  });

  it('exports the account data without secrets, then deletes the account', async () => {
    const exp = await call('GET', '/account/export');
    expect(exp.status).toBe(200);
    const text = await exp.res.text();
    expect(text).toContain('sec@example.com');
    expect(text).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect((await call('POST', '/account/delete', { confirm: 'DELETE', password: 'wrong-password' })).status).toBe(403);
    expect((await call('POST', '/account/delete', { confirm: 'nope', password: 'password-123' })).status).toBe(400);
    expect((await call('POST', '/account/delete', { confirm: 'DELETE', password: 'password-123' })).status).toBe(200);
    expect((await call('GET', '/account/export')).status).toBe(401);
    cookie = '';
    expect((await call('POST', '/auth/login', { contact: 'sec@example.com', password: 'password-123' })).status).not.toBe(200);
  });
});
