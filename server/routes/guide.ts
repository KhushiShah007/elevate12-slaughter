import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, parse } from '../http';
import { buildGuide, rideOptions } from '../guide';

// GET /api/destinations/:slug/guide?style=moderate   places to see/eat with costs and links
// GET /api/transport/options?from=lat,lon,name&to=lat,lon,name&india=1&travellers=2

export const guide = new Hono();

guide.get('/destinations/:slug/guide', async (c) => {
  const slug = parse(z.string().regex(/^[a-z0-9-]{1,60}$/), c.req.param('slug'));
  const { style } = parse(z.object({ style: z.enum(['shoestring', 'moderate', 'comfort', 'luxury']).default('moderate') }), c.req.query());
  const g = await buildGuide(slug, style);
  if (!g) throw new AppError(404, 'not_found', 'We could not find that destination.');
  return c.json(g);
});

const point = z
  .string()
  .max(160)
  .transform((v, ctx) => {
    const [lat, lon, ...name] = v.split(',');
    const p = { lat: Number(lat), lon: Number(lon), name: decodeURIComponent(name.join(',') || 'Pin') };
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
      ctx.addIssue({ code: 'custom', message: 'Use lat,lon,name.' });
      return z.NEVER;
    }
    return p;
  });

guide.get('/transport/options', async (c) => {
  const q = parse(z.object({ from: point, to: point, india: z.enum(['0', '1']).default('1'), travellers: z.coerce.number().int().min(1).max(20).default(1) }), c.req.query());
  return c.json({ ...rideOptions(q.from, q.to, { india: q.india === '1', travellers: q.travellers }), note: 'Fares are estimates without surge or tolls. The app you open shows the real price.' });
});

/** Airport coordinates for the getting-around planner. */
guide.get('/airports/:iata', async (c) => {
  const iata = parse(z.string().regex(/^[A-Z]{3}$/), c.req.param('iata').toUpperCase());
  const { db } = await getDb();
  const [a] = await db.select({ iata: s.airports.iata, name: s.airports.name, city: s.airports.city, lat: s.airports.lat, lon: s.airports.lon }).from(s.airports).where(eq(s.airports.iata, iata)).limit(1);
  if (!a) throw new AppError(404, 'not_found', 'Unknown airport.');
  return c.json({ airport: a });
});
