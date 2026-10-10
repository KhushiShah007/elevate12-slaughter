import { eq } from 'drizzle-orm';
import { getDb, schema as s } from './db/client';

// Hotel search behind one interface (like flights):
//  - AmadeusHotels: live room prices when AMADEUS_CLIENT_ID/SECRET are set.
//  - OsmHotels: always on. Real hotels from OpenStreetMap, with a price *range*
//    estimated from the hotel's class and the destination's typical costs.
// Airbnb has no public API and forbids scraping, so homes are a link out only.

export interface HotelQuery {
  slug: string;
  checkIn: string; // yyyy-mm-dd
  checkOut: string;
  adults: number;
  rooms: number;
}

export interface HotelOffer {
  id: string;
  provider: 'amadeus' | 'openstreetmap';
  live: boolean;
  name: string;
  kind: string; // hotel | hostel | guest_house | …
  stars: number | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  /** Per room per night, INR. For estimates, the middle of the range. */
  pricePerNight: number;
  priceRange: [number, number] | null;
  priceIsEstimate: boolean;
  totalInr: number; // all rooms, all nights
  roomDescription: string | null;
  cancellation: string | null;
  bookUrl: string;
  mapUrl: string | null;
}

export interface HotelResult {
  provider: 'amadeus' | 'openstreetmap';
  live: boolean;
  nights: number;
  offers: HotelOffer[];
  note: string;
  source: { name: string; url: string; license?: string };
  links: { airbnb: string; booking: string };
  fetchedAt: string;
}

type DailyCost = { shoestring: number; moderate: number; comfort: number; luxury: number };

export const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Estimated room price per night from the hotel's class and what a day costs at the
 * destination. Roughly 40–60% of a day's budget goes on the room.
 */
export function estimateRoom(cost: DailyCost, stars: number | null, kind: string | null): { label: string; range: [number, number] } {
  const k = kind ?? 'hotel';
  let base: number;
  let label: string;
  if (k === 'hostel') [base, label] = [cost.shoestring * 0.35, 'hostel'];
  else if (k === 'guest_house' || k === 'motel') [base, label] = [cost.shoestring * 0.7, 'guesthouse'];
  else if (stars != null && stars >= 4.5) [base, label] = [cost.luxury * 0.6, '5-star'];
  else if (stars != null && stars >= 3.5) [base, label] = [cost.comfort * 0.55, '4-star'];
  else if (stars != null && stars >= 2.5) [base, label] = [cost.moderate * 0.5, '3-star'];
  else if (stars != null) [base, label] = [cost.shoestring * 0.6, 'budget'];
  else [base, label] = [cost.moderate * 0.45, 'mid-range']; // class not recorded
  const round = (n: number) => Math.max(300, Math.round(n / 100) * 100);
  return { label, range: [round(base * 0.75), round(base * 1.3)] };
}

export function hotelLinks(q: HotelQuery, city: string) {
  const common = `checkin=${q.checkIn}&checkout=${q.checkOut}`;
  return {
    booking: (name?: string) =>
      `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name ? `${name}, ${city}` : city)}&${common}&group_adults=${q.adults}&no_rooms=${q.rooms}`,
    airbnb: `https://www.airbnb.co.in/s/${encodeURIComponent(city)}/homes?${common}&adults=${q.adults}`,
  };
}

const osmMap = (lat: number | null, lon: number | null) => (lat != null && lon != null ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}` : null);

export async function osmHotels(q: HotelQuery): Promise<HotelResult | null> {
  const { db } = await getDb();
  const [d] = await db.select().from(s.destinations).where(eq(s.destinations.slug, q.slug)).limit(1);
  if (!d) return null;
  const nights = nightsBetween(q.checkIn, q.checkOut);
  const links = hotelLinks(q, d.name);
  const rows = await db.select().from(s.hotelsCache).where(eq(s.hotelsCache.destinationId, d.id));
  const cost = d.dailyCostInr ?? { shoestring: 2000, moderate: 4500, comfort: 9000, luxury: 25000 };
  const seen = new Set<string>();
  const offers: HotelOffer[] = rows
    .filter((h) => !seen.has(h.name.toLowerCase()) && seen.add(h.name.toLowerCase()))
    .map((h) => {
      const est = estimateRoom(cost, h.stars, h.kind);
      const mid = Math.round((est.range[0] + est.range[1]) / 2 / 100) * 100;
      return {
        id: `osm-${h.externalId}`,
        provider: 'openstreetmap' as const,
        live: false,
        name: h.name,
        kind: h.kind ?? 'hotel',
        stars: h.stars,
        address: h.address,
        lat: h.lat,
        lon: h.lon,
        pricePerNight: mid,
        priceRange: est.range,
        priceIsEstimate: true,
        totalInr: mid * nights * q.rooms,
        roomDescription: `Typical ${est.label} room here`,
        cancellation: null,
        bookUrl: links.booking(h.name),
        mapUrl: osmMap(h.lat, h.lon),
      };
    });
  return {
    provider: 'openstreetmap',
    live: false,
    nights,
    offers,
    note: 'Real hotels from OpenStreetMap. Prices are our estimate for this kind of stay here, not a live rate: check availability and price before booking.',
    source: { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' },
    links: { airbnb: links.airbnb, booking: links.booking() },
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- Amadeus (live) ----------

let token: { value: string; until: number } | null = null;
const base = () => (process.env.AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com');
export const amadeusHotelsAvailable = () => Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);

async function amadeusGet<T>(path: string): Promise<T> {
  if (!token || token.until < Date.now() + 60_000) {
    const res = await fetch(`${base()}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.AMADEUS_CLIENT_ID!, client_secret: process.env.AMADEUS_CLIENT_SECRET! }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Amadeus auth ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
  }
  const res = await fetch(`${base()}${path}`, { headers: { authorization: `Bearer ${token.value}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Amadeus ${path.split('?')[0]} ${res.status}`);
  return (await res.json()) as T;
}

interface AmadeusHotelOffer {
  hotel: { hotelId: string; name: string; latitude?: number; longitude?: number; rating?: string };
  available: boolean;
  offers?: { price: { total: string; currency: string }; room?: { description?: { text?: string } }; policies?: { cancellations?: { description?: { text?: string } }[] } }[];
}

export function mapAmadeusHotels(q: HotelQuery, data: AmadeusHotelOffer[], bookUrl: (name: string) => string): HotelOffer[] {
  const nights = nightsBetween(q.checkIn, q.checkOut);
  return data
    .filter((h) => h.available && h.offers?.length)
    .map((h) => {
      const o = h.offers![0];
      const total = Math.round(Number(o.price.total));
      return {
        id: `am-${h.hotel.hotelId}`,
        provider: 'amadeus' as const,
        live: true,
        name: h.hotel.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()),
        kind: 'hotel',
        stars: h.hotel.rating ? Number(h.hotel.rating) : null,
        address: null,
        lat: h.hotel.latitude ?? null,
        lon: h.hotel.longitude ?? null,
        pricePerNight: Math.round(total / Math.max(1, nights) / q.rooms),
        priceRange: null,
        priceIsEstimate: false,
        totalInr: total,
        roomDescription: o.room?.description?.text?.slice(0, 140) ?? null,
        cancellation: o.policies?.cancellations?.[0]?.description?.text ?? null,
        bookUrl: bookUrl(h.hotel.name),
        mapUrl: osmMap(h.hotel.latitude ?? null, h.hotel.longitude ?? null),
      };
    });
}

export async function amadeusHotels(q: HotelQuery): Promise<HotelResult | null> {
  const { db } = await getDb();
  const [d] = await db.select().from(s.destinations).where(eq(s.destinations.slug, q.slug)).limit(1);
  if (!d) return null;
  const links = hotelLinks(q, d.name);
  const list = await amadeusGet<{ data: { hotelId: string }[] }>(`/v1/reference-data/locations/hotels/by-geocode?latitude=${d.lat}&longitude=${d.lon}&radius=10&radiusUnit=KM`);
  const ids = list.data.slice(0, 40).map((h) => h.hotelId);
  if (!ids.length) throw new Error('no hotels near the destination');
  const params = new URLSearchParams({ hotelIds: ids.join(','), checkInDate: q.checkIn, checkOutDate: q.checkOut, adults: String(q.adults), roomQuantity: String(q.rooms), currency: 'INR' });
  const offers = await amadeusGet<{ data: AmadeusHotelOffer[] }>(`/v3/shopping/hotel-offers?${params}`);
  return {
    provider: 'amadeus',
    live: true,
    nights: nightsBetween(q.checkIn, q.checkOut),
    offers: mapAmadeusHotels(q, offers.data ?? [], links.booking),
    note: process.env.AMADEUS_ENV === 'production' ? 'Live room prices from Amadeus.' : 'Amadeus test environment: real hotels, prices may differ from the hotel.',
    source: { name: 'Amadeus', url: 'https://developers.amadeus.com' },
    links: { airbnb: links.airbnb, booking: links.booking() },
    fetchedAt: new Date().toISOString(),
  };
}

/** Live when keyed and it works; otherwise OpenStreetMap hotels with estimated prices. */
export async function searchHotels(q: HotelQuery): Promise<HotelResult | null> {
  if (amadeusHotelsAvailable()) {
    try {
      const live = await amadeusHotels(q);
      if (live?.offers.length) return live;
    } catch (err) {
      console.warn('[hotels] live search failed, using open data:', String(err));
    }
  }
  return osmHotels(q);
}
