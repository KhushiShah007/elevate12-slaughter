import fs from 'node:fs/promises';
import path from 'node:path';
import { DESTINATIONS, type DestinationSeed } from './destination-list';
import { RAW_DIR, politeFetch, sleep, writeSeed } from './lib';

// Pipeline 3: real hotels, attractions and restaurants per destination from OpenStreetMap
// via the Overpass API (ODbL). OSM has names, locations, stars, cuisine and opening hours,
// but no prices: hotel prices are estimated from stars and the destination's cost level and
// are always marked as estimates. Responses are cached in .data/raw/osm.

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const CACHE = path.join(RAW_DIR, 'osm');
const PER_KIND = 12;

interface El {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

const radius = (d: DestinationSeed) => (/Islands|Maldives|Bali|Phuket|Goa/.test(d.name) ? 15000 : 7000);

function query(d: DestinationSeed) {
  const at = `(around:${radius(d)},${d.lat},${d.lon})`;
  return `[out:json][timeout:90];
nwr["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"]["name"]${at};out center tags 80;
nwr["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park)$"]["name"]${at};out center tags 80;
nwr["historic"~"^(castle|fort|monument|palace|ruins|archaeological_site)$"]["name"]${at};out center tags 40;
nwr["amenity"~"^(restaurant|cafe)$"]["name"]${at};out center tags 120;`;
}

async function fetchPlaces(d: DestinationSeed): Promise<El[] | null> {
  const file = path.join(CACHE, `${d.slug}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as El[];
  } catch {
    try {
      const res = await politeFetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: query(d) }) }, 5, 120000);
      const json = (await res.json()) as { elements?: El[]; remark?: string };
      if (json.remark && !json.elements?.length) throw new Error(json.remark);
      await fs.mkdir(CACHE, { recursive: true });
      await fs.writeFile(file, JSON.stringify(json.elements ?? []));
      await sleep(4000); // Overpass asks for gentle use
      return json.elements ?? [];
    } catch (err) {
      console.warn(`${d.name}: ${String(err).slice(0, 160)}`);
      return null;
    }
  }
}

const pos = (e: El) => ({ lat: e.lat ?? e.center?.lat ?? null, lon: e.lon ?? e.center?.lon ?? null });
const osmId = (e: El) => `${e.type}/${e.id}`;
/** Better-documented places first: Wikipedia/Wikidata links, stars, websites. */
const richness = (e: El) => (e.tags.wikidata ? 4 : 0) + (e.tags.wikipedia ? 2 : 0) + (e.tags.stars ? 2 : 0) + (e.tags.website ? 1 : 0) + (e.tags['name:en'] ? 1 : 0);
const top = (els: El[]) => [...els].sort((a, b) => richness(b) - richness(a)).slice(0, PER_KIND);
const nameOf = (e: El) => e.tags['name:en'] ?? e.tags.name;

function hotelPrice(d: DestinationSeed, stars: number | null, kind: string): number {
  // Stay is roughly 40% of the daily cost for one person; two share a room.
  const style = kind === 'hostel' ? 'shoestring' : !stars ? 'moderate' : stars >= 5 ? 'luxury' : stars >= 4 ? 'comfort' : stars >= 3 ? 'moderate' : 'shoestring';
  return Math.round((d.cost[style] * 0.4 * 2) / 100) * 100;
}

async function main() {
  const hotels: unknown[] = [];
  const attractions: unknown[] = [];
  const restaurants: unknown[] = [];
  const missing: string[] = [];
  const base = { source: 'openstreetmap', license: 'ODbL-1.0' };

  for (const d of DESTINATIONS) {
    const els = await fetchPlaces(d);
    if (!els) {
      missing.push(d.slug);
      continue;
    }
    const h = top(els.filter((e) => /^(hotel|guest_house|hostel|apartment|motel)$/.test(e.tags.tourism ?? '')));
    const a = top(els.filter((e) => (e.tags.tourism && !/hotel|guest_house|hostel|apartment|motel/.test(e.tags.tourism)) || e.tags.historic));
    const r = top(els.filter((e) => e.tags.amenity === 'restaurant' || e.tags.amenity === 'cafe'));

    for (const e of h) {
      const stars = Number(e.tags.stars) || null;
      hotels.push({
        ...base,
        destinationSlug: d.slug,
        externalId: osmId(e),
        sourceUrl: `https://www.openstreetmap.org/${osmId(e)}`,
        name: nameOf(e),
        ...pos(e),
        stars,
        kind: e.tags.tourism,
        pricePerNightInr: hotelPrice(d, stars, e.tags.tourism),
        address: [e.tags['addr:street'], e.tags['addr:city']].filter(Boolean).join(', ') || null,
        amenities: [e.tags.internet_access && 'Wi-Fi', e.tags.swimming_pool === 'yes' && 'Pool', e.tags.wheelchair === 'yes' && 'Accessible'].filter(Boolean),
      });
    }
    for (const e of a) {
      attractions.push({
        ...base,
        destinationSlug: d.slug,
        externalId: osmId(e),
        sourceUrl: `https://www.openstreetmap.org/${osmId(e)}`,
        name: nameOf(e),
        ...pos(e),
        category: e.tags.tourism ?? e.tags.historic,
        openingHours: e.tags.opening_hours ?? null,
        fee: e.tags.fee ?? null,
        description: e.tags.description ?? null,
      });
    }
    for (const e of r) {
      const diet = e.tags['diet:vegetarian'];
      restaurants.push({
        ...base,
        destinationSlug: d.slug,
        externalId: osmId(e),
        sourceUrl: `https://www.openstreetmap.org/${osmId(e)}`,
        name: nameOf(e),
        ...pos(e),
        cuisine: e.tags.cuisine?.replace(/;/g, ', ').replace(/_/g, ' ') ?? (e.tags.amenity === 'cafe' ? 'cafe' : null),
        vegetarian: diet === 'only' || diet === 'yes' ? true : diet === 'no' ? false : null,
        openingHours: e.tags.opening_hours ?? null,
      });
    }
    console.log(`${d.name.padEnd(18)} hotels ${h.length}, attractions ${a.length}, restaurants ${r.length}`);
  }

  await writeSeed('places.json', { hotels, attractions, restaurants });
  if (missing.length) console.log(`Not fetched (re-run later to fill in): ${missing.join(', ')}`);
}

void main();
