// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';

const { app } = await import('../app');

/** A tiny client that keeps the session cookie between calls, like a browser. */
function client() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: (await res.json()) as any, setCookie: set };
  };
}

describe('accounts', () => {
  beforeAll(async () => {
    await app.request('/api/health');
  }, 120_000);

  it('signs up with a code and password, then stays signed in', async () => {
    const api = client();
    const otp = await api('POST', '/auth/otp', { contact: 'Riya@Example.com', purpose: 'signup' });
    expect(otp.status).toBe(200);
    expect(otp.body.delivered).toBe(false);
    expect(otp.body.devCode).toMatch(/^\d{6}$/);

    expect((await api('POST', '/auth/otp/check', { contact: 'riya@example.com', purpose: 'signup', code: '000000' === otp.body.devCode ? '111111' : '000000' })).status).toBe(400);
    expect((await api('POST', '/auth/otp/check', { contact: 'riya@example.com', purpose: 'signup', code: otp.body.devCode })).status).toBe(200);

    const signup = await api('POST', '/auth/signup', { name: 'Riya', contact: 'riya@example.com', code: otp.body.devCode, password: 'goa-in-december' });
    expect(signup.status).toBe(201);
    expect(signup.body.me).toMatchObject({ name: 'Riya', email: 'riya@example.com' });
    expect(signup.setCookie).toMatch(/voyage_session=.+HttpOnly/i);

    const me = await api('GET', '/me');
    expect(me.status).toBe(200);
    expect(me.body.me.name).toBe('Riya');
  });

  it('refuses a second account on the same contact, and reused codes', async () => {
    const api = client();
    const again = await api('POST', '/auth/otp', { contact: 'riya@example.com', purpose: 'signup' });
    expect(again.status).toBe(409);
  });

  it('logs in with the password, rejects a wrong one, and logs out', async () => {
    const api = client();
    expect((await api('POST', '/auth/login', { contact: 'riya@example.com', password: 'wrong-password' })).status).toBe(401);
    const ok = await api('POST', '/auth/login', { contact: 'RIYA@example.com', password: 'goa-in-december' });
    expect(ok.status).toBe(200);
    expect((await api('GET', '/me')).status).toBe(200);
    await api('POST', '/auth/logout');
    expect((await api('GET', '/me')).status).toBe(401);
  });

  it('works with an Indian mobile number in any common format', async () => {
    const api = client();
    const otp = await api('POST', '/auth/otp', { contact: '098200 12345', purpose: 'signup' });
    expect(otp.body.contact).toBe('+919820012345');
    const signup = await api('POST', '/auth/signup', { name: 'Arjun', contact: '+91 98200 12345', code: otp.body.devCode, password: 'mumbai-monsoon' });
    expect(signup.status).toBe(201);
    expect(signup.body.me.phone).toBe('+919820012345');
    const login = await client()('POST', '/auth/login', { contact: '9820012345', password: 'mumbai-monsoon' });
    expect(login.status).toBe(200);
  });

  it('resets a forgotten password with a code', async () => {
    const api = client();
    const otp = await api('POST', '/auth/otp', { contact: 'riya@example.com', purpose: 'reset' });
    const reset = await api('POST', '/auth/reset', { contact: 'riya@example.com', code: otp.body.devCode, password: 'new-password-1' });
    expect(reset.status).toBe(200);
    expect((await client()('POST', '/auth/login', { contact: 'riya@example.com', password: 'goa-in-december' })).status).toBe(401);
    expect((await client()('POST', '/auth/login', { contact: 'riya@example.com', password: 'new-password-1' })).status).toBe(200);
  });

  it('saves the profile and works out the persona on the server', async () => {
    const api = client();
    await api('POST', '/auth/login', { contact: 'riya@example.com', password: 'new-password-1' });
    const res = await api('PATCH', '/me', { homeCity: 'Pune', language: 'hi', personaAnswers: { mix: 'family', pace: 'slow' } });
    expect(res.status).toBe(200);
    expect(res.body.me).toMatchObject({ homeCity: 'Pune', language: 'hi', personaId: 'family' });
    // Another device sees the same profile.
    const other = client();
    await other('POST', '/auth/login', { contact: 'riya@example.com', password: 'new-password-1' });
    expect((await other('GET', '/me')).body.me.personaId).toBe('family');
  });

  it('protects profile routes and validates input', async () => {
    expect((await client()('PATCH', '/me', { name: 'X' })).status).toBe(401);
    const bad = await client()('POST', '/auth/otp', { contact: 'not-a-contact', purpose: 'signup' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.contact).toBeTruthy();
  });
});
