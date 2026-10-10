// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

// A fresh in-memory Postgres (PGlite), migrated and seeded, for every test run.
process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';

const { app } = await import('../app');
const get = async (path: string) => {
  const res = await app.request(`/api${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe('API foundation', () => {
  beforeAll(async () => {
    await get('/health'); // first request migrates and seeds
  }, 120_000);

  it('reports health with seeded counts', async () => {
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body.database).toBe('pglite');
    expect((body.counts as { destinations: number }).destinations).toBeGreaterThanOrEqual(50);
    expect((body.counts as { airports: number }).airports).toBeGreaterThan(3000);
  });

  it('lists destinations with images, domestic first', async () => {
    const { body } = await get('/destinations');
    const list = body.destinations as { slug: string; isDomestic: boolean; imageUrl: string | null }[];
    expect(list.length).toBeGreaterThanOrEqual(50);
    expect(list[0].isDomestic).toBe(true);
    expect(list.filter((d) => d.imageUrl).length).toBe(list.length);
  });

  it('uses image URLs Wikimedia will actually serve', async () => {
    const { body } = await get('/destinations');
    for (const d of body.destinations as { imageUrl: string; imageThumbUrl: string }[]) {
      for (const u of [d.imageUrl, d.imageThumbUrl]) {
        expect(u).toMatch(/^https:\/\/upload\.wikimedia\.org\/[^?]+$/);
        // Only standard thumbnail widths are served (others return HTTP 400).
        const w = u.match(/\/(\d+)px-/)?.[1];
        if (w) expect(['330', '500', '960', '1280']).toContain(w);
      }
    }
  });

  it('searches destinations by name or country', async () => {
    const { body } = await get('/destinations?q=japan');
    expect((body.destinations as { slug: string }[]).map((d) => d.slug).sort()).toEqual(['kyoto', 'tokyo']);
  });

  it('returns a destination with its places', async () => {
    const { status, body } = await get('/destinations/jaipur');
    expect(status).toBe(200);
    expect((body.destination as { name: string }).name).toBe('Jaipur');
    expect(Array.isArray(body.hotels)).toBe(true);
  });

  it('autocompletes airports by code and city, busiest first', async () => {
    const byCode = await get('/airports?q=bom');
    expect((byCode.body.airports as { iata: string }[])[0].iata).toBe('BOM');
    const byCity = await get('/airports?q=delhi');
    expect((byCity.body.airports as { iata: string }[])[0].iata).toBe('DEL');
  });

  it('gives clear, consistent errors', async () => {
    const notFound = await get('/destinations/atlantis');
    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toMatchObject({ code: 'not_found' });
    const bad = await get('/airports?q=x');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'invalid_input' });
    expect((await get('/nope')).status).toBe(404);
  });
});

describe('live data', () => {
  it('validates currency codes and unknown places without calling out', async () => {
    const bad = await get('/fx?to=rupee');
    expect(bad.status).toBe(400);
    const inr = await get('/fx?to=INR');
    expect(inr.body).toMatchObject({ rate: 1 });
    expect((await get('/destinations/atlantis/weather')).status).toBe(404);
  });

  it('tells the app which currency each destination uses', async () => {
    expect(((await get('/destinations/tokyo')).body.destination as { currency: string }).currency).toBe('JPY');
    expect(((await get('/destinations/goa')).body.destination as { currency: string }).currency).toBe('INR');
  });
});

describe('weather wording', () => {
  it('turns MET Norway symbols into plain words', async () => {
    const { metWords, weatherWords } = await import('../routes/live');
    expect(metWords('partlycloudy_day')).toBe('Partly cloudy');
    expect(metWords('lightrainshowers_night')).toBe('Showers');
    expect(metWords('heavyrainandthunder')).toBe('Thunderstorm');
    expect(metWords('clearsky_polartwilight')).toBe('Clear');
    expect(weatherWords(61)).toBe('Rain');
  });
});
