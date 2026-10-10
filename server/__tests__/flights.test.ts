// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

// Full seed (with the 65k routes) so route search has real data.
process.env.PGLITE_DIR = 'memory';
delete process.env.SEED_LIGHT;
delete process.env.AMADEUS_CLIENT_ID;

const { app } = await import('../app');
const { estimateFare, estimateMinutes, isoMinutes, mapAmadeus, RETIRED_AIRLINES } = await import('../flights');

let cookie = '';
async function call(path: string) {
  const res = await app.request(`/api${path}`, { headers: cookie ? { cookie } : {} });
  return { status: res.status, body: (await res.json()) as any };
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('flight search', () => {
  beforeAll(async () => {
    const post = (p: string, b: unknown) => app.request(`/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const otp = (await (await post('/auth/otp', { contact: 'flyer@example.com', purpose: 'signup' })).json()) as { devCode: string };
    const res = await post('/auth/signup', { name: 'Flyer', contact: 'flyer@example.com', code: otp.devCode, password: 'password-123' });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
  }, 180_000);

  it('needs an account and valid input', async () => {
    const saved = cookie;
    cookie = '';
    expect((await call(`/flights/search?from=BOM&to=JAI&date=${inDays(30)}`)).status).toBe(401);
    cookie = saved;
    expect((await call(`/flights/search?from=BOMBAY&to=JAI&date=${inDays(30)}`)).status).toBe(400);
    expect((await call('/flights/search?from=BOM&to=JAI&date=2020-01-01')).status).toBe(400);
    expect((await call(`/flights/search?from=BOM&to=BOM&date=${inDays(30)}`)).status).toBe(400);
  });

  it('finds direct airlines from open data, labelled indicative, without retired airlines', async () => {
    const { status, body } = await call(`/flights/search?from=bom&to=jai&date=${inDays(30)}&adults=2`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ provider: 'openflights', live: false });
    expect(body.note).toMatch(/Indicative/);
    const direct = body.offers.filter((o: { stops: number }) => o.stops === 0);
    expect(direct.map((o: { airlines: { iata: string }[] }) => o.airlines[0].iata)).toEqual(expect.arrayContaining(['6E', 'AI']));
    for (const o of body.offers) {
      expect(o.priceIsEstimate).toBe(true);
      expect(o.departAt).toBeNull();
      for (const a of o.airlines) expect(RETIRED_AIRLINES.has(a.iata)).toBe(false);
    }
    expect(body.offers[0].bookUrl).toContain('google.com/travel/flights');
  });

  it('offers one-stop options when there is no direct flight', async () => {
    const { body } = await call(`/flights/search?from=IXZ&to=GOI&date=${inDays(40)}`);
    expect(body.offers.length).toBeGreaterThan(0);
    expect(body.offers.every((o: { stops: number; via: string[] }) => o.stops === 1 && o.via.length === 1)).toBe(true);
  });
});

describe('estimates and mapping', () => {
  it('estimates sensible durations and fares', () => {
    expect(estimateMinutes(1140)).toBeGreaterThan(110); // BOM-DEL about 2h
    expect(estimateMinutes(1140)).toBeLessThan(140);
    const f = estimateFare(1140, { domestic: true, lowCost: true, stops: 0, daysAhead: 30 });
    expect(f.mid).toBeGreaterThan(4000);
    expect(f.mid).toBeLessThan(8000);
    expect(f.range[0]).toBeLessThan(f.mid);
    expect(estimateFare(1140, { domestic: true, lowCost: true, stops: 0, daysAhead: 3 }).mid).toBeGreaterThan(f.mid);
  });

  it('maps an Amadeus offer', () => {
    expect(isoMinutes('PT2H35M')).toBe(155);
    const [o] = mapAmadeus(
      { from: 'BOM', to: 'NRT', date: '2026-12-01', adults: 2 },
      [
        {
          id: '1',
          itineraries: [
            {
              duration: 'PT12H5M',
              segments: [
                { departure: { iataCode: 'BOM', at: '2026-12-01T01:00:00' }, arrival: { iataCode: 'DEL', at: '2026-12-01T03:10:00' }, carrierCode: 'AI', number: '805' },
                { departure: { iataCode: 'DEL', at: '2026-12-01T05:00:00' }, arrival: { iataCode: 'NRT', at: '2026-12-01T16:35:00' }, carrierCode: 'AI', number: '306' },
              ],
            },
          ],
          price: { grandTotal: '90000.00', currency: 'INR' },
        },
      ],
      { AI: 'AIR INDIA' },
    );
    expect(o).toMatchObject({ live: true, stops: 1, via: ['DEL'], durationMin: 725, priceInr: 45000, flightNumbers: ['AI 805', 'AI 306'], priceIsEstimate: false });
    expect(o.airlines).toEqual([{ iata: 'AI', name: 'AIR INDIA' }]);
  });
});
