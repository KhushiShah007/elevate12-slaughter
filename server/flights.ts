import { and, eq, inArray, gt } from 'drizzle-orm';
import { getDb, schema as s } from './db/client';

// Flight search behind one interface, so the provider can change without touching the app.
//  - AmadeusProvider: live offers (times, prices) when AMADEUS_CLIENT_ID/SECRET are set.
//  - OpenFlightsProvider: always available. Real airline routes from the OpenFlights
//    dataset, with duration and price *estimated* from distance. Marked indicative.

export interface SearchInput {
  from: string; // IATA
  to: string;
  date: string; // yyyy-mm-dd
  adults: number;
}

export interface FlightOffer {
  id: string;
  provider: 'amadeus' | 'openflights';
  live: boolean;
  airlines: { iata: string; name: string }[];
  flightNumbers: string[]; // empty when not known
  from: string;
  to: string;
  via: string[];
  stops: number;
  departAt: string | null; // local time at origin, when known
  arriveAt: string | null;
  durationMin: number;
  /** Per person, INR. For indicative offers this is the middle of priceRange. */
  priceInr: number;
  priceRange: [number, number] | null;
  priceIsEstimate: boolean;
  bookUrl: string;
}

export interface SearchResult {
  provider: 'amadeus' | 'openflights';
  live: boolean;
  offers: FlightOffer[];
  note: string;
  source: { name: string; url: string; license?: string };
  fetchedAt: string;
}

export interface FlightProvider {
  name: 'amadeus' | 'openflights';
  available(): boolean;
  search(q: SearchInput): Promise<SearchResult>;
}

// ---------- Helpers ----------

/** Airlines in the 2014 OpenFlights data that no longer fly (merged or shut down). */
export const RETIRED_AIRLINES = new Set(['9W', 'S2', 'G8', 'IC', 'IT', 'US', 'AB', 'VX', 'I5', 'UK', 'HG', 'KF', 'MI']);
const LOW_COST = new Set(['6E', 'SG', 'IX', 'QP', 'AK', 'D7', 'FD', 'TR', 'FZ', 'G9', 'FR', 'U2', 'W6', 'VJ', 'JQ', '3K', 'IU']);

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** Block time from distance: cruise ~780 km/h plus ~35 min taxi, climb and descent. */
export const estimateMinutes = (distanceKm: number) => Math.round((distanceKm / 780) * 60 + 35);

/**
 * Typical one-way economy fare per person, from distance. A rough model, tuned on
 * published Indian domestic and Asia fares; shown only as a range and labelled.
 */
export function estimateFare(distanceKm: number, opts: { domestic: boolean; lowCost: boolean; stops: number; daysAhead: number }) {
  let fare = opts.domestic ? 1800 + 4.2 * distanceKm : 4000 + 5.5 * distanceKm;
  if (opts.lowCost) fare *= 0.85;
  if (opts.stops > 0) fare *= 0.9;
  if (opts.daysAhead < 7) fare *= 1.25;
  else if (opts.daysAhead < 21) fare *= 1.1;
  const mid = Math.round(fare / 100) * 100;
  return { mid, range: [Math.round((mid * 0.85) / 100) * 100, Math.round((mid * 1.2) / 100) * 100] as [number, number] };
}

export function bookingLinks(q: SearchInput) {
  const yymmdd = q.date.slice(2).replace(/-/g, '');
  return {
    skyscanner: `https://www.skyscanner.co.in/transport/flights/${q.from.toLowerCase()}/${q.to.toLowerCase()}/${yymmdd}/?adults=${q.adults}`,
    google: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${q.from} to ${q.to} on ${q.date}`)}`,
  };
}

// ---------- OpenFlights (fallback, always on) ----------

export const openFlightsProvider: FlightProvider = {
  name: 'openflights',
  available: () => true,
  async search(q) {
    const { db } = await getDb();
    const daysAhead = Math.max(0, Math.round((Date.parse(q.date) - Date.now()) / 86_400_000));
    const link = bookingLinks(q).google;

    const direct = await db
      .selectDistinct({ airline: s.routes.airlineIata })
      .from(s.routes)
      .where(and(eq(s.routes.srcIata, q.from), eq(s.routes.dstIata, q.to), eq(s.routes.stops, 0)));
    const directAirlines = direct.map((r) => r.airline).filter((a) => !RETIRED_AIRLINES.has(a));

    // One stop: hubs reachable from the origin that also fly to the destination.
    let viaRows: { hub: string; a1: string; a2: string }[] = [];
    if (directAirlines.length < 3) {
      const out = await db.select({ hub: s.routes.dstIata, a1: s.routes.airlineIata }).from(s.routes).where(eq(s.routes.srcIata, q.from));
      const hubs = [...new Set(out.map((r) => r.hub))];
      if (hubs.length) {
        const inbound = await db
          .select({ hub: s.routes.srcIata, a2: s.routes.airlineIata })
          .from(s.routes)
          .where(and(inArray(s.routes.srcIata, hubs), eq(s.routes.dstIata, q.to)));
        viaRows = inbound.flatMap((i) => out.filter((o) => o.hub === i.hub).map((o) => ({ hub: i.hub, a1: o.a1, a2: i.a2 })));
        viaRows = viaRows.filter((r) => !RETIRED_AIRLINES.has(r.a1) && !RETIRED_AIRLINES.has(r.a2));
      }
    }

    const codes = [...new Set([q.from, q.to, ...viaRows.map((r) => r.hub)])];
    const ports = new Map((await db.select().from(s.airports).where(inArray(s.airports.iata, codes))).map((a) => [a.iata, a]));
    const allAirlines = [...new Set([...directAirlines, ...viaRows.flatMap((r) => [r.a1, r.a2])])];
    const names = new Map(
      allAirlines.length ? (await db.select({ iata: s.airlines.iata, name: s.airlines.name }).from(s.airlines).where(inArray(s.airlines.iata, allAirlines))).map((a) => [a.iata, a.name]) : [],
    );
    const origin = ports.get(q.from);
    const dest = ports.get(q.to);
    if (!origin || !dest) return { provider: 'openflights', live: false, offers: [], note: 'Unknown airport code.', source: OF_SOURCE, fetchedAt: new Date().toISOString() };
    const domestic = origin.country === dest.country;
    const airline = (iata: string) => ({ iata, name: names.get(iata) ?? iata });

    const offers: FlightOffer[] = [];
    const d = km(origin, dest);
    for (const a of directAirlines) {
      const fare = estimateFare(d, { domestic, lowCost: LOW_COST.has(a), stops: 0, daysAhead });
      offers.push({
        id: `of-${q.from}-${q.to}-${a}`,
        provider: 'openflights',
        live: false,
        airlines: [airline(a)],
        flightNumbers: [],
        from: q.from,
        to: q.to,
        via: [],
        stops: 0,
        departAt: null,
        arriveAt: null,
        durationMin: estimateMinutes(d),
        priceInr: fare.mid,
        priceRange: fare.range,
        priceIsEstimate: true,
        bookUrl: link,
      });
    }

    // Best one-stop per hub: same airline on both legs if possible, then the busiest hubs.
    const byHub = new Map<string, { hub: string; a1: string; a2: string }>();
    for (const r of viaRows) {
      const cur = byHub.get(r.hub);
      if (!cur || (r.a1 === r.a2 && cur.a1 !== cur.a2)) byHub.set(r.hub, r);
    }
    const hubs = [...byHub.values()]
      .map((r) => ({ ...r, port: ports.get(r.hub)! }))
      .filter((r) => r.port)
      .map((r) => ({ ...r, dist: km(origin, r.port) + km(r.port, dest) }))
      .filter((r) => r.dist < d * 1.6) // no big detours
      .sort((a, b) => a.dist - b.dist || b.port.routeCount - a.port.routeCount)
      .slice(0, 4);
    for (const r of hubs) {
      const fare = estimateFare(r.dist, { domestic, lowCost: LOW_COST.has(r.a1) && LOW_COST.has(r.a2), stops: 1, daysAhead });
      offers.push({
        id: `of-${q.from}-${r.hub}-${q.to}-${r.a1}-${r.a2}`,
        provider: 'openflights',
        live: false,
        airlines: r.a1 === r.a2 ? [airline(r.a1)] : [airline(r.a1), airline(r.a2)],
        flightNumbers: [],
        from: q.from,
        to: q.to,
        via: [r.hub],
        stops: 1,
        departAt: null,
        arriveAt: null,
        durationMin: estimateMinutes(km(origin, r.port)) + estimateMinutes(km(r.port, dest)) + 90,
        priceInr: fare.mid,
        priceRange: fare.range,
        priceIsEstimate: true,
        bookUrl: link,
      });
    }

    offers.sort((a, b) => a.stops - b.stops || a.priceInr - b.priceInr);
    return {
      provider: 'openflights',
      live: false,
      offers,
      note: offers.length
        ? 'Indicative: airlines that fly this route (OpenFlights data, retired airlines removed). Times are not known; duration and price are estimates from distance. Check live fares before booking.'
        : 'No route found in the open data. Try a nearby airport, or search live fares.',
      source: OF_SOURCE,
      fetchedAt: new Date().toISOString(),
    };
  },
};
const OF_SOURCE = { name: 'OpenFlights', url: 'https://openflights.org/data.html', license: 'ODbL 1.0' };

// ---------- Amadeus (live, when keys are set) ----------

interface AmadeusOffer {
  id: string;
  itineraries: { duration: string; segments: { departure: { iataCode: string; at: string }; arrival: { iataCode: string; at: string }; carrierCode: string; number: string }[] }[];
  price: { grandTotal: string; currency: string };
}

/** "PT2H35M" → 155 */
export const isoMinutes = (d: string) => {
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 0;
};

export function mapAmadeus(q: SearchInput, data: AmadeusOffer[], carriers: Record<string, string>): FlightOffer[] {
  const link = bookingLinks(q).google;
  return data.map((o) => {
    const segs = o.itineraries[0].segments;
    const codes = [...new Set(segs.map((x) => x.carrierCode))];
    const total = Math.round(Number(o.price.grandTotal));
    return {
      id: `am-${o.id}-${segs.map((x) => x.carrierCode + x.number).join('-')}`,
      provider: 'amadeus',
      live: true,
      airlines: codes.map((c) => ({ iata: c, name: carriers[c] ?? c })),
      flightNumbers: segs.map((x) => `${x.carrierCode} ${x.number}`),
      from: segs[0].departure.iataCode,
      to: segs[segs.length - 1].arrival.iataCode,
      via: segs.slice(0, -1).map((x) => x.arrival.iataCode),
      stops: segs.length - 1,
      departAt: segs[0].departure.at,
      arriveAt: segs[segs.length - 1].arrival.at,
      durationMin: isoMinutes(o.itineraries[0].duration),
      priceInr: Math.round(total / q.adults), // Amadeus totals cover all adults
      priceRange: null,
      priceIsEstimate: false,
      bookUrl: link,
    };
  });
}

let token: { value: string; until: number } | null = null;
const amadeusBase = () => (process.env.AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com');

async function amadeusToken() {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const res = await fetch(`${amadeusBase()}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.AMADEUS_CLIENT_ID!, client_secret: process.env.AMADEUS_CLIENT_SECRET! }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Amadeus auth ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return token.value;
}

export const amadeusProvider: FlightProvider = {
  name: 'amadeus',
  available: () => Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET),
  async search(q) {
    const params = new URLSearchParams({ originLocationCode: q.from, destinationLocationCode: q.to, departureDate: q.date, adults: String(q.adults), currencyCode: 'INR', max: '20' });
    const res = await fetch(`${amadeusBase()}/v2/shopping/flight-offers?${params}`, { headers: { authorization: `Bearer ${await amadeusToken()}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Amadeus search ${res.status}`);
    const j = (await res.json()) as { data: AmadeusOffer[]; dictionaries?: { carriers?: Record<string, string> } };
    const offers = mapAmadeus(q, j.data ?? [], j.dictionaries?.carriers ?? {}).sort((a, b) => a.priceInr - b.priceInr);
    return {
      provider: 'amadeus',
      live: true,
      offers,
      note: process.env.AMADEUS_ENV === 'production' ? 'Live fares from Amadeus.' : 'Amadeus test environment: real schedules, fares may differ from airline sites.',
      source: { name: 'Amadeus', url: 'https://developers.amadeus.com' },
      fetchedAt: new Date().toISOString(),
    };
  },
};

/** Live provider when keyed; on any failure (or no keys) the open-data fallback. */
export async function searchFlights(q: SearchInput): Promise<SearchResult> {
  const { db } = await getDb();
  const key = `v1:${q.from}:${q.to}:${q.date}:${q.adults}`;
  const [hit] = await db.select().from(s.flightsCache).where(and(eq(s.flightsCache.cacheKey, key), gt(s.flightsCache.expiresAt, new Date()))).limit(1);
  if (hit) return hit.payload as SearchResult;

  let result: SearchResult | null = null;
  if (amadeusProvider.available()) {
    try {
      result = await amadeusProvider.search(q);
    } catch (err) {
      console.warn('[flights] live search failed, using open data:', String(err));
    }
  }
  result ??= await openFlightsProvider.search(q);
  const ttl = result.live ? 30 * 60_000 : 24 * 3_600_000;
  await db
    .insert(s.flightsCache)
    .values({ cacheKey: key, provider: result.provider, payload: result, expiresAt: new Date(Date.now() + ttl) })
    .onConflictDoUpdate({ target: s.flightsCache.cacheKey, set: { provider: result.provider, payload: result, fetchedAt: new Date(), expiresAt: new Date(Date.now() + ttl) } });
  return result;
}
