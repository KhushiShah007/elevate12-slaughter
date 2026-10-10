// @vitest-environment node
import { describe, expect, it } from 'vitest';

process.env.PGLITE_DIR = 'memory';
delete process.env.SEED_LIGHT; // airports with coordinates are needed

const { app } = await import('../app');
const get = async (path: string) => {
  const res = await app.request(`/api${path}`);
  return { status: res.status, body: (await res.json()) as any };
};
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('budget-first planning', () => {
  it('ranks destinations for a budget with a full breakdown and fit badges', async () => {
    const { status, body } = await get('/budget/where?budget=40000&origin=BOM&days=4&travellers=2&style=moderate');
    expect(status).toBe(200);
    expect(body.origin.city).toBe('Mumbai');
    expect(body.results.length).toBeGreaterThan(40);
    const goa = body.results.find((r: { slug: string }) => r.slug === 'goa');
    const paris = body.results.find((r: { slug: string }) => r.slug === 'paris');
    const b = goa.breakdown;
    expect(b.total).toBe(b.travel + b.stay + b.food + b.local + b.activities + b.buffer);
    expect(goa.breakdown.total).toBeLessThan(paris.breakdown.total);
    expect(paris.fit).toBe('over');
    expect(['within', 'tight', 'over']).toContain(goa.fit);
  }, 180_000);

  it('shows a price calendar and the cheapest day', async () => {
    const { body } = await get(`/budget/dates?origin=BOM&dest=GOI&date=${inDays(40)}&travellers=2`);
    expect(body.days.length).toBeGreaterThan(15);
    expect(body.cheapest.total).toBeLessThanOrEqual(body.chosen.total);
    expect(body.saving).toBe(body.chosen.total - body.cheapest.total);
  });

  it('suggests concrete cuts with savings when over budget', async () => {
    const { body } = await get(`/budget/cuts?slug=jaipur&budget=20000&origin=BOM&days=5&travellers=2&style=comfort&date=${inDays(40)}`);
    expect(body.overBy).toBeGreaterThan(0);
    expect(body.cuts.length).toBeGreaterThan(1);
    expect(body.cuts.map((c: { kind: string }) => c.kind)).toEqual(expect.arrayContaining(['nights', 'style']));
    for (let i = 1; i < body.cuts.length; i++) expect(body.cuts[i - 1].saving).toBeGreaterThanOrEqual(body.cuts[i].saving);
  });
});
