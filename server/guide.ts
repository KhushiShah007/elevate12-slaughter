import { asc, eq } from 'drizzle-orm';
import { getDb, schema as s } from './db/client';

// A city guide for one destination: places to see and eat, each with what it is likely
// to cost (an estimate, labelled), entry fee when OpenStreetMap knows it, ratings from
// Google when GOOGLE_MAPS_API_KEY is set, and links to reviews and the map.

type DailyCost = { shoestring: number; moderate: number; comfort: number; luxury: number };
export type Style = keyof DailyCost;

export interface GuidePlace {
  id: number;
  name: string;
  kind: 'see' | 'eat';
  category: string | null; // museum, fort, viewpoint… or cafe, restaurant
  cuisine: string | null;
  vegetarian: boolean | null;
  lat: number | null;
  lon: number | null;
  openingHours: string | null;
  /** Entry: 'free' / 'paid' when OpenStreetMap says so, else null (unknown). */
  entry: 'free' | 'paid' | null;
  /** Per person, INR, estimated. Meals: one meal. Sights: null (fees vary; see `entry`). */
  costRange: [number, number] | null;
  rating: number | null;
  ratingCount: number | null;
  reviewsUrl: string;
  mapUrl: string;
  directionsUrl: string | null;
  website: string | null;
  phone: string | null;
  description: string | null;
  // Experiences
  famous: boolean;
  /** 0..1: well-loved but little-known (high rating, few reviews; or documented local spot). */
  nicheScore: number;
  indoor: boolean;
  intensity: number; // 1..5
  durationMin: number;
  bestTime: string | null;
  bookingOptions: { provider: string; url: string }[];
  // Restaurants
  diets: string[];
  reservationUrl: string | null;
}

export interface Guide {
  destination: { slug: string; name: string; country: string; lat: number; lon: number; airportIata: string | null; dailyCostInr: DailyCost | null; isDomestic: boolean };
  see: GuidePlace[];
  eat: GuidePlace[];
  ratingsFrom: 'google' | null;
  note: string;
}

const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

/** One meal per person: cafés and quick food cost less than sit-down restaurants. */
export function mealCost(cost: DailyCost, style: Style, kind: 'cafe' | 'quick' | 'restaurant'): [number, number] {
  const base = cost[style] * 0.12 * (kind === 'cafe' ? 0.55 : kind === 'quick' ? 0.5 : 1);
  return [round50(base * 0.7), round50(base * 1.4)];
}

export const eateryKind = (cuisine: string | null): 'cafe' | 'quick' | 'restaurant' =>
  !cuisine ? 'restaurant' : /cafe|coffee|tea|bakery|dessert|ice cream/i.test(cuisine) ? 'cafe' : /pizza|burger|fast|sandwich|street/i.test(cuisine) ? 'quick' : 'restaurant';

export function entryFrom(fee: string | null): 'free' | 'paid' | null {
  if (!fee) return null;
  if (/^no$/i.test(fee.trim())) return 'free';
  return 'paid';
}

const INDOOR = new Set(['museum', 'gallery']);
const INTENSITY: Record<string, number> = { museum: 2, gallery: 2, monument: 2, attraction: 2, artwork: 1, castle: 4, fort: 4, ruins: 3, archaeological_site: 3, viewpoint: 3, zoo: 3, theme_park: 4 };
const DURATION: Record<string, number> = { museum: 90, gallery: 60, monument: 45, attraction: 60, castle: 120, fort: 120, ruins: 75, archaeological_site: 90, viewpoint: 45, zoo: 150, theme_park: 180 };
const BEST: Record<string, string> = { viewpoint: 'Sunset', fort: 'Early morning (cooler, fewer people)', castle: 'Morning', ruins: 'Morning', museum: 'Any time (indoors)', gallery: 'Any time (indoors)', zoo: 'Morning' };

/** Search links on experience sites (no partner keys needed); disclosed as possible affiliate links. */
export function experienceLinks(name: string, city: string, website: string | null) {
  const q = encodeURIComponent(`${name} ${city}`);
  return [
    ...(website ? [{ provider: 'Official website', url: website }] : []),
    { provider: 'GetYourGuide', url: `https://www.getyourguide.com/s/?q=${q}` },
    { provider: 'Viator', url: `https://www.viator.com/searchResults/all?text=${q}` },
    { provider: 'Klook', url: `https://www.klook.com/search/result/?query=${q}` },
    { provider: 'Airbnb Experiences', url: `https://www.airbnb.co.in/s/${encodeURIComponent(city)}/experiences` },
  ];
}

/** Hidden-gem score: with ratings, high stars and few reviews; without, documented but not famous. */
export function nicheScore(famous: boolean, rating: number | null, count: number | null, documented: boolean) {
  if (rating != null && count != null) return famous ? 0.1 : Math.max(0, Math.min(1, ((rating - 4) / 1) * (1 - Math.min(count, 2000) / 2000)));
  return famous ? 0 : documented ? 0.6 : 0.4;
}

const mapsSearch = (name: string, city: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${city}`)}`;
const osmPoint = (lat: number | null, lon: number | null, name: string, city: string) =>
  lat != null && lon != null ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}` : mapsSearch(name, city);

// ---------- Google ratings (optional) ----------

const ratingCache = new Map<string, { at: number; v: { rating: number | null; count: number | null; url: string | null } }>();
export const googleAvailable = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);

/** Rating for one place from Google Places (New) Text Search; cached for a day in memory. */
async function googleRating(name: string, city: string, lat: number | null, lon: number | null) {
  const key = `${name}|${city}`;
  const hit = ratingCache.get(key);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.v;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY!,
      'X-Goog-FieldMask': 'places.rating,places.userRatingCount,places.googleMapsUri',
    },
    body: JSON.stringify({
      textQuery: `${name}, ${city}`,
      maxResultCount: 1,
      ...(lat != null && lon != null ? { locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 500 } } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const j = (await res.json()) as { places?: { rating?: number; userRatingCount?: number; googleMapsUri?: string }[] };
  const p = j.places?.[0];
  const v = { rating: p?.rating ?? null, count: p?.userRatingCount ?? null, url: p?.googleMapsUri ?? null };
  ratingCache.set(key, { at: Date.now(), v });
  return v;
}

export async function buildGuide(slug: string, style: Style): Promise<Guide | null> {
  const { db } = await getDb();
  const [d] = await db.select().from(s.destinations).where(eq(s.destinations.slug, slug)).limit(1);
  if (!d) return null;
  const cost = d.dailyCostInr ?? { shoestring: 2000, moderate: 4500, comfort: 9000, luxury: 25000 };
  const [attractions, restaurants] = await Promise.all([
    db.select().from(s.attractions).where(eq(s.attractions.destinationId, d.id)).orderBy(asc(s.attractions.id)),
    db.select().from(s.restaurants).where(eq(s.restaurants.destinationId, d.id)).orderBy(asc(s.restaurants.id)),
  ]);
  const unique = <T extends { name: string }>(rows: T[]) => rows.filter((r, i) => rows.findIndex((x) => x.name.toLowerCase() === r.name.toLowerCase()) === i);

  const see: GuidePlace[] = unique(attractions).map((a) => ({
    id: a.id,
    name: a.name,
    kind: 'see',
    category: a.category,
    cuisine: null,
    vegetarian: null,
    lat: a.lat,
    lon: a.lon,
    openingHours: a.openingHours,
    entry: entryFrom(a.fee),
    costRange: null,
    rating: null,
    ratingCount: null,
    reviewsUrl: mapsSearch(a.name, d.name),
    mapUrl: osmPoint(a.lat, a.lon, a.name, d.name),
    directionsUrl: a.lat != null && a.lon != null ? `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lon}` : null,
    website: a.website,
    phone: a.phone,
    description: a.description,
    famous: a.famous,
    nicheScore: nicheScore(a.famous, null, null, Boolean(a.website || a.openingHours)),
    indoor: INDOOR.has(a.category ?? ''),
    intensity: INTENSITY[a.category ?? ''] ?? 2,
    durationMin: DURATION[a.category ?? ''] ?? 60,
    bestTime: BEST[a.category ?? ''] ?? null,
    bookingOptions: experienceLinks(a.name, d.name, a.website),
    diets: [],
    reservationUrl: null,
  }));
  const eat: GuidePlace[] = unique(restaurants).map((r) => {
    const kind = eateryKind(r.cuisine);
    return {
      id: r.id,
      name: r.name,
      kind: 'eat',
      category: kind,
      cuisine: r.cuisine,
      vegetarian: r.vegetarian,
      lat: r.lat,
      lon: r.lon,
      openingHours: r.openingHours,
      entry: null,
      costRange: mealCost(cost, style, kind),
      rating: null,
      ratingCount: null,
      reviewsUrl: mapsSearch(r.name, d.name),
      mapUrl: osmPoint(r.lat, r.lon, r.name, d.name),
      directionsUrl: r.lat != null && r.lon != null ? `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}` : null,
      website: r.website,
      phone: r.phone,
      description: null,
      famous: false,
      nicheScore: 0,
      indoor: true,
      intensity: 1,
      durationMin: kind === 'cafe' ? 45 : 75,
      bestTime: null,
      bookingOptions: [],
      diets: r.diets?.length ? r.diets : r.vegetarian ? ['veg'] : [],
      reservationUrl: r.reservation && r.reservation !== 'no' ? (r.website ?? null) : null,
    };
  });

  let ratingsFrom: Guide['ratingsFrom'] = null;
  if (googleAvailable()) {
    // Ratings for the first places only, to keep requests (and cost) small.
    const targets = [...see.slice(0, 8), ...eat.slice(0, 8)];
    const results = await Promise.allSettled(targets.map((p) => googleRating(p.name, d.name, p.lat, p.lon)));
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      targets[i].rating = r.value.rating;
      targets[i].ratingCount = r.value.count;
      if (r.value.url) targets[i].reviewsUrl = r.value.url;
      if (targets[i].kind === 'see') targets[i].nicheScore = nicheScore(targets[i].famous, r.value.rating, r.value.count, true);
    });
    if (results.some((r) => r.status === 'fulfilled')) ratingsFrom = 'google';
  }

  return {
    destination: { slug: d.slug, name: d.name, country: d.country, lat: d.lat, lon: d.lon, airportIata: d.airportIata, dailyCostInr: d.dailyCostInr, isDomestic: d.isDomestic },
    see,
    eat,
    ratingsFrom,
    note:
      'Places from OpenStreetMap. Meal costs are typical for this kind of place here (estimates).' +
      (ratingsFrom ? ' Ratings from Google.' : ' Tap Reviews to read them on Google Maps.'),
  };
}

// ---------- Getting around ----------

export interface RideOption {
  mode: 'bike' | 'auto' | 'cab' | 'cab-xl' | 'transit' | 'walk';
  label: string;
  provider: string;
  fareRange: [number, number] | null; // INR, estimate, whole ride
  minutes: number;
  seats: number;
  link: string;
  note?: string;
}

export const roadKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.35; // roads are longer than the straight line
};

const fare = (base: number, perKm: number, perMin: number, km: number, min: number): [number, number] => {
  const f = base + perKm * km + perMin * min;
  return [Math.round((f * 0.9) / 10) * 10, Math.round((f * 1.3) / 10) * 10]; // no surge included
};

export interface Point {
  lat: number;
  lon: number;
  name: string;
}

export function rideOptions(from: Point, to: Point, opts: { india: boolean; travellers: number }): { km: number; options: RideOption[] } {
  const km = Math.max(0.5, roadKm(from, to));
  const minutes = Math.round((km / 24) * 60 + 6); // city traffic ~24 km/h
  const enc = encodeURIComponent;
  const uber = `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${from.lat}&pickup[longitude]=${from.lon}&pickup[nickname]=${enc(from.name)}&dropoff[latitude]=${to.lat}&dropoff[longitude]=${to.lon}&dropoff[nickname]=${enc(to.name)}`;
  const ola = `https://book.olacabs.com/?pickup_name=${enc(from.name)}&lat=${from.lat}&lng=${from.lon}&drop_name=${enc(to.name)}&drop_lat=${to.lat}&drop_lng=${to.lon}`;
  const transit = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=transit`;
  const walking = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=walking`;
  const options: RideOption[] = [];

  if (km <= 1.5) options.push({ mode: 'walk', label: 'Walk', provider: 'Google Maps', fareRange: [0, 0], minutes: Math.round((km / 4.5) * 60), seats: 99, link: walking });
  options.push({ mode: 'transit', label: 'Metro / bus', provider: 'Google Maps', fareRange: null, minutes: Math.round(minutes * 1.4), seats: 99, link: transit, note: 'Usually the cheapest. Fares and times in Google Maps.' });
  if (opts.india) {
    if (opts.travellers === 1) options.push({ mode: 'bike', label: 'Bike taxi', provider: 'Rapido', fareRange: fare(15, 6, 0.5, km, minutes), minutes, seats: 1, link: 'https://www.rapido.bike/', note: 'Open Rapido and set the drop.' });
    if (opts.travellers <= 3) options.push({ mode: 'auto', label: 'Auto', provider: 'Uber / Ola / Rapido', fareRange: fare(30, 15, 0.5, km, minutes), minutes, seats: 3, link: uber });
    options.push({ mode: 'cab', label: 'Cab (mini)', provider: 'Uber / Ola', fareRange: fare(60, 14, 1.5, km, minutes), minutes, seats: 4, link: uber });
    options.push({ mode: 'cab', label: 'Cab (mini)', provider: 'Ola', fareRange: fare(60, 14, 1.5, km, minutes), minutes, seats: 4, link: ola });
    if (opts.travellers > 4) options.push({ mode: 'cab-xl', label: 'Cab (XL, 6 seats)', provider: 'Uber / Ola', fareRange: fare(90, 18, 2, km, minutes), minutes, seats: 6, link: uber });
  } else {
    options.push({ mode: 'cab', label: 'Taxi / Uber', provider: 'Uber', fareRange: null, minutes, seats: 4, link: uber, note: 'Uber shows the local price.' });
  }
  // Cheapest first; transit (no number) sits after walking.
  options.sort((a, b) => (a.fareRange?.[0] ?? (a.mode === 'transit' ? 1 : 1e9)) - (b.fareRange?.[0] ?? (b.mode === 'transit' ? 1 : 1e9)));
  return { km: Math.round(km * 10) / 10, options };
}
