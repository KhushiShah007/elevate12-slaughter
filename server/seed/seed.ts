import fs from 'node:fs/promises';
import path from 'node:path';
import { count, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';

// Loads the open datasets produced by data-pipeline/ into the database.
// Safe to re-run: reference data is upserted or replaced.

const DATA = path.resolve(process.cwd(), 'server/seed/data');
const OPENFLIGHTS = { source: 'openflights', sourceUrl: 'https://openflights.org/data.html', license: 'ODbL-1.0' };

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, name), 'utf8')) as T;
  } catch {
    return null;
  }
}

async function inChunks<T>(rows: T[], size: number, run: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await run(rows.slice(i, i + size));
}

type Log = (msg: string) => void;

export async function seedAll(db: Db, log: Log = console.log) {
  // Airports and airlines (upsert).
  const airports = await readJson<{ iata: string; icao: string | null; name: string; city: string; country: string; lat: number; lon: number; tz: string | null; routeCount: number }[]>('airports.json');
  if (airports) {
    await inChunks(airports, 500, (chunk) =>
      db
        .insert(s.airports)
        .values(chunk.map((a) => ({ ...a, ...OPENFLIGHTS })))
        .onConflictDoUpdate({ target: s.airports.iata, set: { name: sql`excluded.name`, city: sql`excluded.city`, routeCount: sql`excluded.route_count` } }),
    );
    log(`airports: ${airports.length}`);
  }
  const airlines = await readJson<{ iata: string; icao: string | null; name: string; country: string | null }[]>('airlines.json');
  if (airlines) {
    await inChunks(airlines, 500, (chunk) =>
      db
        .insert(s.airlines)
        .values(chunk.map((a) => ({ ...a, ...OPENFLIGHTS })))
        .onConflictDoNothing(),
    );
    log(`airlines: ${airlines.length}`);
  }

  // Routes: replaced wholesale (no natural key).
  // SEED_LIGHT=1 (tests) skips the 65k routes to keep runs fast.
  const routes = process.env.SEED_LIGHT ? null : await readJson<[string, string, string, number, string | null][]>('routes.json');
  if (routes) {
    await db.delete(s.routes);
    await inChunks(routes, 2000, (chunk) =>
      db.insert(s.routes).values(chunk.map(([airlineIata, srcIata, dstIata, stops, equipment]) => ({ airlineIata, srcIata, dstIata, stops, equipment, ...OPENFLIGHTS }))),
    );
    log(`routes: ${routes.length}`);
  }

  // Destinations (upsert by slug).
  type Dest = Record<string, unknown> & { slug: string; cost: Record<string, number> };
  const dests = await readJson<Dest[]>('destinations.json');
  if (dests) {
    for (const d of dests) {
      const row = {
        slug: d.slug,
        name: d.name as string,
        country: d.country as string,
        region: d.region as string,
        isDomestic: d.isDomestic as boolean,
        lat: d.lat as number,
        lon: d.lon as number,
        airportIata: d.airportIata as string,
        description: d.description as string | null,
        bestTime: d.bestTime as string,
        idealDays: d.idealDays as number,
        tags: d.tags as string[],
        personaTags: d.personaTags as string[],
        dailyCostInr: d.cost as { shoestring: number; moderate: number; comfort: number; luxury: number },
        featured: Boolean(d.featured),
        imageUrl: d.imageUrl as string | null,
        imageThumbUrl: d.imageThumbUrl as string | null,
        imageCredit: d.imageCredit as string | null,
        imageLicense: d.imageLicense as string | null,
        source: d.source as string,
        sourceUrl: d.sourceUrl as string,
        license: d.license as string,
      };
      await db.insert(s.destinations).values(row).onConflictDoUpdate({ target: s.destinations.slug, set: row });
    }
    log(`destinations: ${dests.length}`);
  }

  // Places from OpenStreetMap (hotels, attractions, restaurants).
  type Place = Record<string, unknown> & { destinationSlug: string; externalId: string; name: string };
  const places = await readJson<{ hotels: Place[]; attractions: Place[]; restaurants: Place[] }>('places.json');
  if (places) {
    const ids = new Map((await db.select({ id: s.destinations.id, slug: s.destinations.slug }).from(s.destinations)).map((d) => [d.slug, d.id]));
    const common = (p: Place) => ({
      destinationId: ids.get(p.destinationSlug)!,
      name: p.name,
      lat: p.lat as number | null,
      lon: p.lon as number | null,
      externalId: p.externalId,
      source: p.source as string,
      sourceUrl: p.sourceUrl as string,
      license: p.license as string,
    });
    const known = (p: Place) => ids.has(p.destinationSlug);

    // A hotel near two destinations appears twice in the data: keep its first one.
    const firstOf = new Set<string>();
    const hotels = places.hotels.filter((p) => known(p) && !firstOf.has(p.externalId) && firstOf.add(p.externalId));
    await inChunks(hotels, 300, (chunk) =>
      db
        .insert(s.hotelsCache)
        .values(
          chunk.map((p) => ({
            ...common(p),
            provider: 'openstreetmap',
            kind: (p.kind as string | null) ?? null,
            stars: p.stars as number | null,
            pricePerNightInr: p.pricePerNightInr as number,
            priceIsEstimate: true,
            amenities: p.amenities as string[],
            address: p.address as string | null,
          })),
        )
        .onConflictDoUpdate({ target: [s.hotelsCache.provider, s.hotelsCache.externalId], set: { kind: sql`excluded.kind`, stars: sql`excluded.stars` } }),
    );
    await inChunks(places.attractions.filter(known), 300, (chunk) =>
      db
        .insert(s.attractions)
        .values(chunk.map((p) => ({ ...common(p), category: p.category as string, openingHours: p.openingHours as string | null, fee: p.fee as string | null, description: p.description as string | null })))
        .onConflictDoNothing(),
    );
    await inChunks(places.restaurants.filter(known), 300, (chunk) =>
      db
        .insert(s.restaurants)
        .values(chunk.map((p) => ({ ...common(p), cuisine: p.cuisine as string | null, vegetarian: p.vegetarian as boolean | null, openingHours: p.openingHours as string | null })))
        .onConflictDoNothing(),
    );
    log(`places: ${places.hotels.length} hotels, ${places.attractions.length} attractions, ${places.restaurants.length} restaurants`);
  } else {
    log('places: none yet (run npm run pipeline:places)');
  }
}

/** Seed automatically the first time the server starts on an empty database. */
export async function ensureSeeded(db: Db, log: Log = console.log) {
  const [{ n }] = await db.select({ n: count() }).from(s.destinations);
  if (n > 0) return false;
  log('Empty database: loading seed data…');
  await seedAll(db, log);
  return true;
}
