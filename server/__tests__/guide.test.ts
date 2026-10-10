// @vitest-environment node
import { describe, expect, it } from 'vitest';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';
delete process.env.GOOGLE_MAPS_API_KEY;

const { app } = await import('../app');
const { eateryKind, entryFrom, mealCost, rideOptions } = await import('../guide');

const get = async (path: string) => {
  const res = await app.request(`/api${path}`);
  return { status: res.status, body: (await res.json()) as any };
};

describe('city guide', () => {
  it('returns places with cost estimates and review links', async () => {
    const { status, body } = await get('/destinations/jaipur/guide?style=shoestring');
    expect(status).toBe(200);
    expect(body.see.length).toBeGreaterThan(5);
    expect(body.eat.length).toBeGreaterThan(5);
    expect(body.ratingsFrom).toBeNull();
    for (const p of body.eat) {
      expect(p.costRange[0]).toBeLessThanOrEqual(p.costRange[1]);
      expect(p.reviewsUrl).toContain('google.com/maps/search');
    }
    const comfort = await get('/destinations/jaipur/guide?style=comfort');
    expect(comfort.body.eat[0].costRange[0]).toBeGreaterThan(body.eat[0].costRange[0]);
  }, 120_000);

  it('estimates sensibly', () => {
    const cost = { shoestring: 1800, moderate: 4500, comfort: 10000, luxury: 28000 };
    expect(eateryKind('coffee shop')).toBe('cafe');
    expect(eateryKind('pizza')).toBe('quick');
    expect(eateryKind('indian')).toBe('restaurant');
    expect(mealCost(cost, 'moderate', 'cafe')[1]).toBeLessThan(mealCost(cost, 'moderate', 'restaurant')[1]);
    expect(entryFrom('no')).toBe('free');
    expect(entryFrom('yes')).toBe('paid');
    expect(entryFrom(null)).toBeNull();
  });
});

describe('getting around', () => {
  const airport = { lat: 26.8242, lon: 75.8122, name: 'Jaipur Airport' };
  const city = { lat: 26.9124, lon: 75.7873, name: 'Hawa Mahal' };

  it('offers cheapest first with app links, and fits the group', () => {
    const solo = rideOptions(airport, city, { india: true, travellers: 1 });
    expect(solo.km).toBeGreaterThan(9);
    expect(solo.options.map((o) => o.mode)).toEqual(expect.arrayContaining(['bike', 'auto', 'cab', 'transit']));
    const priced = solo.options.filter((o) => o.fareRange);
    expect(priced.map((o) => o.fareRange![0])).toEqual([...priced.map((o) => o.fareRange![0])].sort((a, b) => a - b));
    expect(solo.options.find((o) => o.mode === 'cab')!.link).toContain('m.uber.com/ul/');
    const group = rideOptions(airport, city, { india: true, travellers: 6 });
    expect(group.options.some((o) => o.mode === 'bike' || o.mode === 'auto')).toBe(false);
    expect(group.options.some((o) => o.mode === 'cab-xl')).toBe(true);
    const abroad = rideOptions(airport, city, { india: false, travellers: 2 });
    expect(abroad.options.every((o) => o.provider !== 'Ola' && o.provider !== 'Rapido')).toBe(true);
  });

  it('validates points over the API', async () => {
    expect((await get('/transport/options?from=x&to=1,2,a')).status).toBe(400);
    const ok = await get('/transport/options?from=26.8242,75.8122,Airport&to=26.9124,75.7873,Hawa%20Mahal&travellers=2');
    expect(ok.status).toBe(200);
    expect(ok.body.options.length).toBeGreaterThan(2);
    expect((await get('/airports/JAI')).body.airport.city).toBe('Jaipur');
  });
});

describe('experience and restaurant details', () => {
  it('marks famous sights and hidden gems, with booking search links and diet tags', async () => {
    const { body } = await get('/destinations/jaipur/guide');
    expect(body.see.some((p: { famous: boolean }) => p.famous)).toBe(true);
    const gem = body.see.find((p: { famous: boolean; nicheScore: number }) => !p.famous && p.nicheScore >= 0.5);
    expect(gem).toBeTruthy();
    expect(body.see[0].bookingOptions.map((b: { provider: string }) => b.provider)).toEqual(expect.arrayContaining(['GetYourGuide', 'Viator', 'Klook', 'Airbnb Experiences']));
    expect(body.see[0].directionsUrl ?? body.see[0].mapUrl).toMatch(/^https:/);
    for (const r of body.eat) expect(Array.isArray(r.diets)).toBe(true);
  });

  it('scores niche places from ratings when available', async () => {
    const { nicheScore } = await import('../guide');
    expect(nicheScore(false, 4.8, 120, true)).toBeGreaterThan(0.7);
    expect(nicheScore(false, 4.8, 5000, true)).toBe(0);
    expect(nicheScore(true, 4.9, 50, true)).toBe(0.1);
  });
});
