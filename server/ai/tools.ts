import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { getDb, schema as s } from '../db/client';
import { searchFlights } from '../flights';
import { searchHotels } from '../hotels';
import { getWeather } from '../routes/live';
import type { LlmTool } from './llm';

// What the assistant can look up. Every tool is read-only and scoped to the signed-in
// traveller. Results are small JSON the model summarises; each also yields "links"
// the app shows as buttons, so the traveller lands on the real screen.

export interface ToolLink {
  label: string;
  to: string;
}

export interface ToolResult {
  data: unknown;
  links: ToolLink[];
}

const today = () => new Date().toISOString().slice(0, 10);

export const TOOLS: LlmTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_my_trips',
      description: "The traveller's own trips (title, from, to, dates, travellers, budget) and options they saved (flights, stays).",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_destination',
      description: 'Facts about a destination in the catalogue: description, best time, ideal days, daily cost by budget style, top places to see and eat.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'City or place name, e.g. "Jaipur"' } }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_destinations',
      description: 'Destinations from the catalogue matching a theme or budget. Use for "where should I go" questions.',
      parameters: {
        type: 'object',
        properties: {
          tag: { type: 'string', description: 'One of: beach, culture, nature, adventure, family, foodie, spiritual, budget, luxury, honeymoon, shopping' },
          domestic: { type: 'boolean', description: 'true for India only, false for abroad' },
          maxDailyCostInr: { type: 'number', description: 'Maximum shoestring daily cost per person' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_flights',
      description: 'Flight options between two airports on a date. Prices may be estimates (check priceIsEstimate).',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '3-letter IATA code, e.g. BOM' },
          to: { type: 'string', description: '3-letter IATA code' },
          date: { type: 'string', description: 'yyyy-mm-dd' },
          adults: { type: 'number' },
        },
        required: ['from', 'to', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_stays',
      description: 'Hotels at a destination for dates. Prices may be estimates (check priceIsEstimate).',
      parameters: {
        type: 'object',
        properties: { destination: { type: 'string' }, checkIn: { type: 'string', description: 'yyyy-mm-dd' }, checkOut: { type: 'string', description: 'yyyy-mm-dd' }, adults: { type: 'number' } },
        required: ['destination', 'checkIn', 'checkOut'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Current weather and the 7-day forecast for a destination.',
      parameters: { type: 'object', properties: { destination: { type: 'string' } }, required: ['destination'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_my_documents',
      description: "The traveller's saved documents: kind, title, holder, expiry date. ID numbers are masked.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

async function findDestination(name: string) {
  const { db } = await getDb();
  const q = name.trim().slice(0, 60);
  const [d] = await db
    .select()
    .from(s.destinations)
    .where(or(ilike(s.destinations.name, q), ilike(s.destinations.slug, q.toLowerCase().replace(/\s+/g, '-')), ilike(s.destinations.name, `%${q}%`)))
    .limit(1);
  return d ?? null;
}

const notFound = (what: string) => ({ data: { error: `${what} is not in the Voyage catalogue.` }, links: [] });

export async function runTool(userId: string, name: string, rawArgs: string): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
  } catch {
    return { data: { error: 'Arguments were not valid JSON.' }, links: [] };
  }
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '');
  const { db } = await getDb();

  switch (name) {
    case 'list_my_trips': {
      const trips = await db.select().from(s.trips).where(eq(s.trips.userId, userId)).orderBy(asc(s.trips.startDate)).limit(20);
      const saved = await db
        .select({ payload: s.userRecords.payload })
        .from(s.userRecords)
        .where(and(eq(s.userRecords.userId, userId), eq(s.userRecords.tbl, 'bookings'), eq(s.userRecords.deleted, false)));
      const options = saved
        .map((r) => r.payload as { tripId: string; kind: string; title: string; amount: number; status: string; details?: { priceIsEstimate?: boolean; summary?: string } })
        .filter((b) => b.status === 'suggested');
      return {
        data: {
          today: today(),
          trips: trips.map((t) => ({
            id: t.id,
            title: t.title,
            from: t.origin,
            to: t.destinationName,
            startDate: t.startDate,
            endDate: t.endDate,
            travellers: t.travellers,
            budgetInr: t.budgetInr,
            savedOptions: options.filter((o) => o.tripId === t.id).map((o) => ({ kind: o.kind, title: o.title, totalInr: o.amount, priceIsEstimate: !!o.details?.priceIsEstimate, when: o.details?.summary })),
          })),
        },
        links: trips.slice(0, 3).map((t) => ({ label: t.title, to: `/trips/${t.id}` })),
      };
    }
    case 'get_destination': {
      const d = await findDestination(str('name'));
      if (!d) return notFound(str('name') || 'That place');
      const [sights, eats] = await Promise.all([
        db.select({ name: s.attractions.name, category: s.attractions.category }).from(s.attractions).where(eq(s.attractions.destinationId, d.id)).orderBy(asc(s.attractions.id)).limit(6),
        db.select({ name: s.restaurants.name, cuisine: s.restaurants.cuisine, vegetarian: s.restaurants.vegetarian }).from(s.restaurants).where(eq(s.restaurants.destinationId, d.id)).orderBy(asc(s.restaurants.id)).limit(5),
      ]);
      return {
        data: { name: d.name, country: d.country, description: d.description, bestTime: d.bestTime, idealDays: d.idealDays, dailyCostPerPersonInr: d.dailyCostInr, airport: d.airportIata, placesToSee: sights, placesToEat: eats },
        links: [{ label: `About ${d.name}`, to: `/destinations/${d.slug}` }],
      };
    }
    case 'suggest_destinations': {
      const rows = await db.select().from(s.destinations).orderBy(desc(s.destinations.featured), asc(s.destinations.name));
      const tag = str('tag').toLowerCase();
      const max = typeof args.maxDailyCostInr === 'number' ? args.maxDailyCostInr : null;
      const picks = rows
        .filter((d) => !tag || d.personaTags.includes(tag) || d.tags.includes(tag))
        .filter((d) => (typeof args.domestic === 'boolean' ? d.isDomestic === args.domestic : true))
        .filter((d) => (max ? (d.dailyCostInr?.shoestring ?? Infinity) <= max : true))
        .slice(0, 6);
      return {
        data: { destinations: picks.map((d) => ({ name: d.name, country: d.country, bestTime: d.bestTime, idealDays: d.idealDays, shoestringPerDayInr: d.dailyCostInr?.shoestring })) },
        links: picks.slice(0, 3).map((d) => ({ label: d.name, to: `/destinations/${d.slug}` })),
      };
    }
    case 'search_flights': {
      const from = str('from').toUpperCase();
      const to = str('to').toUpperCase();
      const date = str('date');
      if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) return { data: { error: 'Need two 3-letter airport codes and a future date (yyyy-mm-dd).' }, links: [] };
      const adults = Math.min(9, Math.max(1, Math.round(Number(args.adults) || 1)));
      const r = await searchFlights({ from, to, date, adults });
      return {
        data: {
          live: r.live,
          note: r.note,
          offers: r.offers.slice(0, 5).map((o) => ({ airlines: o.airlines.map((a) => a.name), route: [o.from, ...o.via, o.to].join('-'), stops: o.stops, departAt: o.departAt, durationMin: o.durationMin, pricePerPersonInr: o.priceRange ?? o.priceInr, priceIsEstimate: o.priceIsEstimate })),
        },
        links: [],
      };
    }
    case 'search_stays': {
      const d = await findDestination(str('destination'));
      if (!d) return notFound(str('destination') || 'That place');
      const checkIn = str('checkIn');
      const checkOut = str('checkOut');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn || checkIn < today()) return { data: { error: 'Need future check-in and later check-out dates (yyyy-mm-dd).' }, links: [] };
      const r = await searchHotels({ slug: d.slug, checkIn, checkOut, adults: Math.min(20, Math.max(1, Math.round(Number(args.adults) || 2))), rooms: 1 });
      return {
        data: r
          ? { live: r.live, nights: r.nights, note: r.note, stays: r.offers.slice(0, 5).map((o) => ({ name: o.name, kind: o.kind, stars: o.stars, perNightInr: o.priceRange ?? o.pricePerNight, priceIsEstimate: o.priceIsEstimate })) }
          : { error: 'No stays found.' },
        links: [{ label: `Places to stay in ${d.name}`, to: `/destinations/${d.slug}` }],
      };
    }
    case 'get_weather': {
      const d = await findDestination(str('destination'));
      if (!d) return notFound(str('destination') || 'That place');
      try {
        const w = await getWeather(d.slug);
        return { data: w ? { place: d.name, now: w.now, days: w.days, source: w.source, stale: !!w.stale } : { error: 'No forecast.' }, links: [{ label: d.name, to: `/destinations/${d.slug}` }] };
      } catch {
        return { data: { error: 'Weather is not available right now.' }, links: [] };
      }
    }
    case 'list_my_documents': {
      const docs = await db.select().from(s.verificationDocuments).where(eq(s.verificationDocuments.userId, userId)).limit(30);
      return {
        data: { today: today(), documents: docs.map((d) => ({ kind: d.docType, title: d.title, holder: d.holder, expires: d.expiresOn, number: d.maskedNumber })) },
        links: [{ label: 'Open wallet', to: '/wallet' }],
      };
    }
    default:
      return { data: { error: `Unknown tool ${name}` }, links: [] };
  }
}
