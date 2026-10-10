import { inArray } from 'drizzle-orm';
import { getDb, schema as s } from './db/client';
import { searchFlights } from './flights';

// Getting between cities. Providers behind interfaces so live APIs can plug in:
//  - flights: the flight provider (Amadeus or the OpenFlights fallback)
//  - trains: IRCTC has no public API -> estimate + deep link (TrainProvider stub)
//  - buses: redBus partner API needs approval -> estimate + deep link (BusProvider stub)
//  - rides: Uber Rides API needs approval -> deep links (RideProvider, see guide.ts)
// Every price without a live source is labelled an estimate.

export interface IntercityOption {
  mode: 'flight' | 'train' | 'bus' | 'car';
  title: string;
  provider: string;
  durationMin: number;
  /** Whole trip, all travellers, one way (INR). */
  priceInr: number;
  priceIsEstimate: boolean;
  link: string;
  note?: string;
  badges: ('cheapest' | 'fastest')[];
}

export interface TrainProvider {
  name: string;
  search(from: string, to: string, date: string): Promise<IntercityOption[]>;
}
export interface BusProvider {
  name: string;
  search(from: string, to: string, date: string): Promise<IntercityOption[]>;
}

const slug = (city: string) => city.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
const roadKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25;
};

export async function intercity(from: string, to: string, date: string, travellers: number) {
  const { db } = await getDb();
  const ports = await db.select().from(s.airports).where(inArray(s.airports.iata, [from, to]));
  const a = ports.find((p) => p.iata === from);
  const b = ports.find((p) => p.iata === to);
  if (!a || !b) return null;
  const km = roadKm(a, b);
  const india = a.country === 'India' && b.country === 'India';
  const options: IntercityOption[] = [];

  // Flights: the cheapest offer from the flight provider.
  const flights = await searchFlights({ from, to, date, adults: travellers });
  const best = [...flights.offers].sort((x, y) => x.priceInr - y.priceInr)[0];
  if (best) {
    options.push({
      mode: 'flight',
      title: `Fly ${best.airlines.map((x) => x.name).join(' + ')}${best.stops ? ` via ${best.via.join(', ')}` : ''}`,
      provider: flights.live ? 'Amadeus' : 'OpenFlights (indicative)',
      durationMin: best.durationMin + 150, // plus getting to the airport and boarding
      priceInr: best.priceInr * travellers,
      priceIsEstimate: best.priceIsEstimate,
      link: best.bookUrl,
      note: 'Includes about 2.5 h for airport travel and check-in.',
      badges: [],
    });
  }
  if (india && km < 2200) {
    const fare = Math.round((km * 1.6 + 150) / 50) * 50; // 3AC, roughly
    options.push({
      mode: 'train',
      title: 'Train (3AC sleeper)',
      provider: 'IRCTC',
      durationMin: Math.round((km / 55) * 60),
      priceInr: fare * travellers,
      priceIsEstimate: true,
      link: 'https://www.irctc.co.in/nget/train-search',
      note: 'IRCTC has no public API: search there for trains and seats.',
      badges: [],
    });
  }
  if (india && km < 1200) {
    const fare = Math.round((km * 1.3 + 100) / 50) * 50; // AC sleeper bus
    options.push({
      mode: 'bus',
      title: 'Bus (AC sleeper)',
      provider: 'redBus',
      durationMin: Math.round((km / 45) * 60),
      priceInr: fare * travellers,
      priceIsEstimate: true,
      link: `https://www.redbus.in/bus-tickets/${slug(a.city)}-to-${slug(b.city)}`,
      badges: [],
    });
  }
  if (km < 1500 && (india || a.country === b.country)) {
    const cab = Math.round((km * (travellers > 4 ? 18 : 12)) / 100) * 100; // outstation cab incl. driver, one way
    options.push({
      mode: 'car',
      title: travellers > 4 ? 'Outstation cab (SUV)' : 'Outstation cab or drive',
      provider: 'Road',
      durationMin: Math.round((km / 55) * 60),
      priceInr: cab,
      priceIsEstimate: true,
      link: `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lon}&destination=${b.lat},${b.lon}&travelmode=driving`,
      note: 'Cab fare estimate; tolls and driver allowance may be extra.',
      badges: [],
    });
  }
  if (options.length) {
    [...options].sort((x, y) => x.priceInr - y.priceInr)[0].badges.push('cheapest');
    [...options].sort((x, y) => x.durationMin - y.durationMin)[0].badges.push('fastest');
  }
  return {
    from: { iata: a.iata, city: a.city },
    to: { iata: b.iata, city: b.city },
    km: Math.round(km),
    options,
    more: `https://www.rome2rio.com/map/${encodeURIComponent(a.city)}/${encodeURIComponent(b.city)}`,
    note: 'Train, bus and cab prices are estimates; flights follow the flight search.',
  };
}

/** Car rental link-outs (no rental API without approval). */
export function carRental(city: string, india: boolean) {
  return india
    ? [
        { provider: 'Zoomcar (self-drive)', url: 'https://www.zoomcar.com/', note: 'Typically ₹2,000–3,500 a day for a hatchback (estimate)' },
        { provider: 'Search local rentals', url: `https://www.google.com/search?q=${encodeURIComponent(`self drive car rental ${city}`)}` },
      ]
    : [
        { provider: 'Rentalcars.com', url: 'https://www.rentalcars.com/', note: 'Compare international rental companies' },
        { provider: 'Search local rentals', url: `https://www.google.com/search?q=${encodeURIComponent(`car rental ${city}`)}` },
      ];
}
