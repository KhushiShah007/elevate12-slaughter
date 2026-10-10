// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';
delete process.env.AMADEUS_CLIENT_ID;

const { app } = await import('../app');
const { estimateRoom, mapAmadeusHotels } = await import('../hotels');

let cookie = '';
const call = async (path: string) => {
  const res = await app.request(`/api${path}`, { headers: cookie ? { cookie } : {} });
  return { status: res.status, body: (await res.json()) as any };
};
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('hotel search', () => {
  beforeAll(async () => {
    const post = (p: string, b: unknown) => app.request(`/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const otp = (await (await post('/auth/otp', { contact: 'stay@example.com', purpose: 'signup' })).json()) as { devCode: string };
    const res = await post('/auth/signup', { name: 'Stay', contact: 'stay@example.com', code: otp.devCode, password: 'password-123' });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
  }, 120_000);

  it('validates dates and needs an account', async () => {
    expect((await call(`/hotels/search?slug=jaipur&checkIn=${inDays(10)}&checkOut=${inDays(9)}`)).status).toBe(400);
    expect((await call(`/hotels/search?slug=jaipur&checkIn=${inDays(10)}&checkOut=${inDays(50)}`)).status).toBe(400);
    expect((await call(`/hotels/search?slug=atlantis&checkIn=${inDays(10)}&checkOut=${inDays(12)}`)).status).toBe(404);
    const saved = cookie;
    cookie = '';
    expect((await call(`/hotels/search?slug=jaipur&checkIn=${inDays(10)}&checkOut=${inDays(12)}`)).status).toBe(401);
    cookie = saved;
  });

  it('returns real OpenStreetMap hotels with estimated price ranges and links', async () => {
    const { status, body } = await call(`/hotels/search?slug=jaipur&checkIn=${inDays(10)}&checkOut=${inDays(13)}&adults=2&rooms=1`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ provider: 'openstreetmap', live: false, nights: 3 });
    expect(body.offers.length).toBeGreaterThanOrEqual(8);
    for (const o of body.offers) {
      expect(o.priceIsEstimate).toBe(true);
      expect(o.priceRange[0]).toBeLessThan(o.priceRange[1]);
      expect(o.totalInr).toBe(o.pricePerNight * 3);
      expect(o.bookUrl).toContain('booking.com');
    }
    expect(body.links.airbnb).toContain('airbnb.co.in/s/Jaipur');
    expect(body.note).toMatch(/estimate/);
  });
});

describe('room price estimates', () => {
  const cost = { shoestring: 1800, moderate: 4500, comfort: 9000, luxury: 25000 };
  it('ranks hostel < guesthouse < 3-star < 4-star < 5-star', () => {
    const mids = [
      estimateRoom(cost, null, 'hostel'),
      estimateRoom(cost, null, 'guest_house'),
      estimateRoom(cost, 3, 'hotel'),
      estimateRoom(cost, 4, 'hotel'),
      estimateRoom(cost, 5, 'hotel'),
    ].map((e) => e.range[0] + e.range[1]);
    expect([...mids].sort((a, b) => a - b)).toEqual(mids);
  });

  it('maps live Amadeus offers', () => {
    const [o] = mapAmadeusHotels(
      { slug: 'jaipur', checkIn: '2026-12-18', checkOut: '2026-12-20', adults: 2, rooms: 1 },
      [{ hotel: { hotelId: 'XYZ', name: 'RAMBAGH PALACE', rating: '5', latitude: 26.9, longitude: 75.8 }, available: true, offers: [{ price: { total: '60000.00', currency: 'INR' } }] }],
      (n) => `https://booking.example/${n}`,
    );
    expect(o).toMatchObject({ name: 'Rambagh Palace', live: true, stars: 5, pricePerNight: 30000, totalInr: 60000, priceIsEstimate: false });
  });
});
