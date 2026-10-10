import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, parse } from '../http';
import { currencyFor } from './live';

// Read-only reference data: destinations (with places) and airports.

export const catalog = new Hono();

const listQuery = z.object({
  q: z.string().trim().max(60).optional(),
  domestic: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
});

catalog.get('/destinations', async (c) => {
  const q = parse(listQuery, c.req.query());
  const { db } = await getDb();
  const where = and(
    q.q ? or(ilike(s.destinations.name, `%${q.q}%`), ilike(s.destinations.country, `%${q.q}%`), ilike(s.destinations.region, `%${q.q}%`)) : undefined,
    q.domestic ? eq(s.destinations.isDomestic, q.domestic === 'true') : undefined,
    q.featured ? eq(s.destinations.featured, q.featured === 'true') : undefined,
  );
  const rows = await db
    .select({
      id: s.destinations.id,
      slug: s.destinations.slug,
      name: s.destinations.name,
      country: s.destinations.country,
      region: s.destinations.region,
      isDomestic: s.destinations.isDomestic,
      airportIata: s.destinations.airportIata,
      bestTime: s.destinations.bestTime,
      idealDays: s.destinations.idealDays,
      tags: s.destinations.tags,
      personaTags: s.destinations.personaTags,
      dailyCostInr: s.destinations.dailyCostInr,
      featured: s.destinations.featured,
      imageUrl: s.destinations.imageUrl,
      imageThumbUrl: s.destinations.imageThumbUrl,
      imageCredit: s.destinations.imageCredit,
    })
    .from(s.destinations)
    .where(where)
    .orderBy(desc(s.destinations.isDomestic), asc(s.destinations.region), asc(s.destinations.name));
  return c.json({ destinations: rows });
});

catalog.get('/destinations/:slug', async (c) => {
  const slug = parse(z.string().regex(/^[a-z0-9-]{1,60}$/), c.req.param('slug'));
  const { db } = await getDb();
  const [destination] = await db.select().from(s.destinations).where(eq(s.destinations.slug, slug)).limit(1);
  if (!destination) throw new AppError(404, 'not_found', 'We could not find that destination.');
  const [attractions, restaurants, hotels] = await Promise.all([
    // Seed order is best first (the pipeline ranks by how much is known about each place).
    db.select().from(s.attractions).where(eq(s.attractions.destinationId, destination.id)).orderBy(asc(s.attractions.id)),
    db.select().from(s.restaurants).where(eq(s.restaurants.destinationId, destination.id)).orderBy(asc(s.restaurants.id)),
    db.select().from(s.hotelsCache).where(eq(s.hotelsCache.destinationId, destination.id)).orderBy(desc(sql`coalesce(${s.hotelsCache.stars}, 0)`)),
  ]);
  // Chains repeat (five Starbucks): keep the first of each name.
  const unique = <T extends { name: string }>(rows: T[]) => rows.filter((r, i) => rows.findIndex((x) => x.name.toLowerCase() === r.name.toLowerCase()) === i);
  return c.json({ destination: { ...destination, currency: currencyFor(destination.country) }, attractions: unique(attractions), restaurants: unique(restaurants), hotels: unique(hotels) });
});

catalog.get('/airports', async (c) => {
  const { q } = parse(z.object({ q: z.string().trim().min(2).max(40) }), c.req.query());
  const { db } = await getDb();
  const code = q.toUpperCase();
  const rows = await db
    .select({ iata: s.airports.iata, name: s.airports.name, city: s.airports.city, country: s.airports.country, tz: s.airports.tz })
    .from(s.airports)
    .where(or(eq(s.airports.iata, code), ilike(s.airports.city, `${q}%`), ilike(s.airports.name, `%${q}%`)))
    // Exact code first, then the busiest airports.
    .orderBy(desc(sql`${s.airports.iata} = ${code}`), desc(s.airports.routeCount))
    .limit(10);
  return c.json({ airports: rows });
});
