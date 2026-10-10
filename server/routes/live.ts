import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, parse } from '../http';

// Live data that needs no key: weather (Open-Meteo) and exchange rates
// (Frankfurter / ECB, with ExchangeRate-API for currencies the ECB does not publish).
// Answers are cached in memory and always say where they came from and when.

export const live = new Hono();

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** GET JSON with a timeout; one quick retry, since free APIs are sometimes slow to wake. */
async function getJson<T>(url: string, tries = 2): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'VoyageTravelApp/0.1' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
      return (await res.json()) as T;
    } catch (err) {
      if (i + 1 >= tries) throw err;
    }
  }
}

/** WMO weather codes in plain words. */
export function weatherWords(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

live.get('/destinations/:slug/weather', async (c) => {
  const slug = parse(z.string().regex(/^[a-z0-9-]{1,60}$/), c.req.param('slug'));
  const { db } = await getDb();
  const [d] = await db.select({ lat: s.destinations.lat, lon: s.destinations.lon }).from(s.destinations).where(eq(s.destinations.slug, slug)).limit(1);
  if (!d) throw new AppError(404, 'not_found', 'We could not find that destination.');
  try {
    const out = await cached(`wx:${slug}`, 30 * 60_000, async () => {
      const r = await getJson<{
        current: { time: string; temperature_2m: number; weather_code: number };
        daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; precipitation_probability_max: (number | null)[] };
      }>(
        `https://api.open-meteo.com/v1/forecast?latitude=${d.lat}&longitude=${d.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto&forecast_days=7`,
      );
      return {
        now: { tempC: Math.round(r.current.temperature_2m), summary: weatherWords(r.current.weather_code), at: r.current.time },
        days: r.daily.time.map((date, i) => ({
          date,
          maxC: Math.round(r.daily.temperature_2m_max[i]),
          minC: Math.round(r.daily.temperature_2m_min[i]),
          summary: weatherWords(r.daily.weather_code[i]),
          rainChance: r.daily.precipitation_probability_max[i],
        })),
        source: 'Open-Meteo',
        sourceUrl: 'https://open-meteo.com',
        license: 'CC BY 4.0',
        fetchedAt: new Date().toISOString(),
      };
    });
    return c.json(out);
  } catch {
    throw new AppError(503, 'weather_unavailable', 'Weather is not available right now.');
  }
});

/** Currency of each destination country. */
const CURRENCY: Record<string, string> = {
  India: 'INR',
  'United Arab Emirates': 'AED',
  Singapore: 'SGD',
  Thailand: 'THB',
  Indonesia: 'IDR',
  Malaysia: 'MYR',
  Vietnam: 'VND',
  Maldives: 'MVR',
  Nepal: 'NPR',
  'Sri Lanka': 'LKR',
  Japan: 'JPY',
  'South Korea': 'KRW',
  'Hong Kong': 'HKD',
  Türkiye: 'TRY',
  France: 'EUR',
  'United Kingdom': 'GBP',
  Italy: 'EUR',
  Switzerland: 'CHF',
  'United States': 'USD',
  Australia: 'AUD',
};
export const currencyFor = (country: string) => CURRENCY[country] ?? null;

live.get('/fx', async (c) => {
  const { to } = parse(z.object({ to: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code.') }), c.req.query());
  if (to === 'INR') return c.json({ base: 'INR', to, rate: 1, source: 'n/a', date: null });
  try {
    const out = await cached(`fx:${to}`, 6 * 3_600_000, async () => {
      try {
        const r = await getJson<{ date: string; rates: Record<string, number> }>(`https://api.frankfurter.dev/v1/latest?base=INR&symbols=${to}`);
        if (r.rates[to]) return { base: 'INR', to, rate: r.rates[to], date: r.date, source: 'Frankfurter (European Central Bank)', sourceUrl: 'https://frankfurter.dev' };
      } catch {
        /* the ECB does not publish every currency: try the second source */
      }
      const r = await getJson<{ result: string; time_last_update_utc: string; rates: Record<string, number> }>('https://open.er-api.com/v6/latest/INR');
      if (r.result !== 'success' || !r.rates[to]) throw new Error('no rate');
      return { base: 'INR', to, rate: r.rates[to], date: r.time_last_update_utc, source: 'Rates by Exchange Rate API', sourceUrl: 'https://www.exchangerate-api.com' };
    });
    return c.json({ ...out, fetchedAt: new Date().toISOString() });
  } catch {
    throw new AppError(503, 'fx_unavailable', 'Exchange rates are not available right now.');
  }
});
