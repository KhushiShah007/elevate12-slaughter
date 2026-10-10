// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';

const { app } = await import('../app');
let cookie = '';
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => null)) as any, res };
};
const d = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('itinerary API', () => {
  beforeAll(async () => {
    const post = (p: string, b: unknown) => app.request(`/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const otp = (await (await post('/auth/otp', { contact: 'itin@example.com', purpose: 'signup' })).json()) as { devCode: string };
    const res = await post('/auth/signup', { name: 'Itin', contact: 'itin@example.com', code: otp.devCode, password: 'password-123' });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
    await call('PATCH', '/me', { personaAnswers: { interests: 'culture', mix: 'family', food: 'veg' } });
    await call('POST', '/sync/push', { key: crypto.randomUUID(), table: 'trips', recordId: 'it-1', op: 'put', baseRev: 0, payload: { id: 'it-1', title: 'Jaipur', from: 'Mumbai', to: 'Jaipur', destinationSlug: 'jaipur', startDate: d(30), endDate: d(33), travellers: 2, budgetInr: 50000, status: 'upcoming' } });
  }, 120_000);

  it('generates a versioned plan for every day', async () => {
    const r = await call('POST', '/itineraries/it-1/generate');
    expect(r.status).toBe(200);
    expect(r.body.itinerary.plan.days).toHaveLength(4);
    expect(r.body.itinerary.version).toBe(1);
    expect(r.body.itinerary.plan.days[1].items.some((i: { type: string }) => i.type === 'rest')).toBe(true); // family rest break
  });

  it('adapts for sickness with emergency info, keeps a version with a diff, and can undo', async () => {
    const cur = await call('GET', '/itineraries/it-1');
    const day = cur.body.itinerary.plan.days[1].date;
    const r = await call('POST', '/itineraries/it-1/adapt', { mode: 'sick', date: day, baseVersion: 1 });
    expect(r.body.changed).toBe(true);
    expect(r.body.emergency.numbers.all).toBe('112');
    expect(r.body.versions[0]).toMatchObject({ version: 2, reason: 'Feeling sick' });
    expect(r.body.versions[0].changes.length).toBeGreaterThan(0);
    // Stale writes are refused.
    expect((await call('POST', '/itineraries/it-1/adapt', { mode: 'rain', date: day, baseVersion: 1 })).status).toBe(409);
    const undone = await call('POST', '/itineraries/it-1/undo', { baseVersion: 2 });
    expect(undone.body.itinerary.version).toBe(3);
    expect(JSON.stringify(undone.body.itinerary.plan)).toBe(JSON.stringify(cur.body.itinerary.plan));
  });

  it('exports to PDF and calendar', async () => {
    const pdf = await app.request('/api/itineraries/it-1/export/pdf', { headers: { cookie } });
    expect((await pdf.text()).startsWith('%PDF')).toBe(true);
    const ics = await (await app.request('/api/itineraries/it-1/export/ics', { headers: { cookie } })).text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBeGreaterThan(5);
  });
});
