// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';

const { app } = await import('../app');

function client() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: (await res.json()) as any };
  };
}

async function signedIn(email: string) {
  const api = client();
  const otp = await api('POST', '/auth/otp', { contact: email, purpose: 'signup' });
  await api('POST', '/auth/signup', { name: 'Tester', contact: email, code: otp.body.devCode, password: 'password-123' });
  return api;
}

const trip = (over: object = {}) => ({
  id: 'trip-goa-1',
  title: 'Goa with friends',
  from: 'Mumbai',
  to: 'Goa',
  destinationSlug: 'goa',
  startDate: '2026-12-20',
  endDate: '2026-12-24',
  travellers: 3,
  status: 'upcoming',
  ...over,
});
const push = (over: object = {}) => ({ key: crypto.randomUUID(), table: 'trips', recordId: 'trip-goa-1', op: 'put', payload: trip(), baseRev: 0, ...over });

describe('trips and sync', () => {
  let a: ReturnType<typeof client>;
  let b: ReturnType<typeof client>;
  beforeAll(async () => {
    await app.request('/api/health');
    a = await signedIn('a@example.com');
    b = await signedIn('b@example.com');
  }, 120_000);

  it('needs an account', async () => {
    expect((await client()('GET', '/trips')).status).toBe(401);
    expect((await client()('POST', '/sync/push', push())).status).toBe(401);
  });

  it('saves a new trip and lists it on the account', async () => {
    const res = await a('POST', '/sync/push', push());
    expect(res.body).toEqual({ kind: 'applied', rev: 1 });
    const list = await a('GET', '/trips');
    expect(list.body.trips).toHaveLength(1);
    expect(list.body.trips[0]).toMatchObject({ id: 'trip-goa-1', title: 'Goa with friends', destinationName: 'Goa', travellers: 3, startDate: '2026-12-20' });
    expect(list.body.trips[0].destinationId).toBeTypeOf('number');
  });

  it('applies a replayed change only once', async () => {
    const change = push({ key: 'same-key-12345', payload: trip({ title: 'Goa again' }), baseRev: 1 });
    expect((await a('POST', '/sync/push', change)).body.kind).toBe('applied');
    expect((await a('POST', '/sync/push', change)).body.kind).toBe('duplicate');
  });

  it('reports a conflict when the record changed elsewhere', async () => {
    const res = await a('POST', '/sync/push', push({ payload: trip({ title: 'Old edit' }), baseRev: 1 }));
    expect(res.body.kind).toBe('conflict');
    expect(res.body.serverPayload.title).toBe('Goa again');
  });

  it('rejects bad trips with a clear message', async () => {
    const res = await a('POST', '/sync/push', push({ recordId: 'trip-x', payload: trip({ id: 'trip-x', startDate: '2026-12-24', endDate: '2026-12-20' }) }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/before the start/);
  });

  it('keeps accounts apart, and pulls everything back on a new device', async () => {
    expect((await b('GET', '/trips')).body.trips).toHaveLength(0);
    expect((await b('GET', '/sync/pull')).body.records).toHaveLength(0);
    await a('POST', '/sync/push', { key: crypto.randomUUID(), table: 'expenses', recordId: 'e-1', op: 'put', payload: { id: 'e-1', tripId: 'trip-goa-1', amount: 1200 }, baseRev: 0 });
    const pulled = await a('GET', '/sync/pull');
    expect(pulled.body.records.map((r: { table: string }) => r.table).sort()).toEqual(['expenses', 'trips']);
  });

  it('deletes a trip', async () => {
    await a('POST', '/sync/push', push({ op: 'delete', payload: null, baseRev: 2 }));
    expect((await a('GET', '/trips')).body.trips).toHaveLength(0);
  });

  it('autosaves a draft, resumes it, and refuses stale overwrites', async () => {
    expect((await a('GET', '/trips/draft')).body.draft).toBeNull();
    const created = await a('PUT', '/trips/draft', { data: { to: 'Jaipur' } });
    expect(created.status).toBe(201);
    const id = created.body.draft.id;
    const saved = await a('PUT', '/trips/draft', { id, data: { to: 'Jaipur', title: 'Pink city' }, version: 1 });
    expect(saved.body.draft.version).toBe(2);
    expect((await a('PUT', '/trips/draft', { id, data: { to: 'Old' }, version: 1 })).status).toBe(409);
    expect((await a('GET', '/trips/draft')).body.draft.data.title).toBe('Pink city');
    expect((await b('GET', '/trips/draft')).body.draft).toBeNull();
    await a('DELETE', `/trips/draft/${id}`);
    expect((await a('GET', '/trips/draft')).body.draft).toBeNull();
  });
});
