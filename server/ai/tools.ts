import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { getDb, schema as s } from '../db/client';
import { searchFlights } from '../flights';
import { searchHotels } from '../hotels';
import { getWeather } from '../routes/live';
import type { LlmTool } from './llm';
import { adaptItinerary } from '../routes/itinerary';
import { createQuote } from '../routes/cancellations';

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
  {
    type: 'function',
    function: {
      name: 'replan_itinerary',
      description: "Change today's plan of the traveller's next trip because of how they feel or the weather. Creates a new version they can undo.",
      parameters: {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['sick', 'tired', 'lighter', 'rain', 'late'] }, date: { type: 'string', description: 'yyyy-mm-dd; default today or the first full day' } },
        required: ['mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_cancellation',
      description: "Start a cancellation for one of the traveller's bookings and get a refund estimate. It does NOT cancel: the traveller must confirm in the app.",
      parameters: { type: 'object', properties: { booking: { type: 'string', description: 'Booking name, hotel, flight number or PNR' } }, required: ['booking'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trip_budget',
      description: "Budget of the traveller's trip: total budget, booked and saved costs, refunds, spent so far.",
      parameters: { type: 'object', properties: { trip: { type: 'string', description: 'Trip title or destination (optional)' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'flight_status',
      description: "Status of one of the traveller's flights.",
      parameters: { type: 'object', properties: { flight: { type: 'string', description: 'Flight number, e.g. 6E 5321' } }, required: ['flight'] },
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
    case 'replan_itinerary': {
      const mode = str('mode') as 'sick' | 'tired' | 'lighter' | 'rain' | 'late';
      if (!['sick', 'tired', 'lighter', 'rain', 'late'].includes(mode)) return { data: { error: 'Unknown mode.' }, links: [] };
      const its = await db.select().from(s.itineraries).where(eq(s.itineraries.userId, userId));
      const trips = its.length ? await db.select().from(s.trips).where(eq(s.trips.userId, userId)) : [];
      const today = new Date().toISOString().slice(0, 10);
      const pick = its
        .map((i) => ({ i, t: trips.find((t) => t.id === i.tripId) }))
        .filter((x) => x.t && x.t.endDate >= today)
        .sort((a, b) => a.t!.startDate.localeCompare(b.t!.startDate))[0];
      if (!pick) return { data: { error: 'No upcoming trip has an itinerary yet. Open a trip and its Itinerary first.' }, links: [] };
      const plan = pick.i.plan as { days: { date: string; kind: string }[] };
      const date = str('date') || plan.days.find((d) => d.date === today)?.date || plan.days.find((d) => d.kind === 'full')?.date || plan.days[0].date;
      const r = await adaptItinerary(userId, pick.i.tripId, { mode, date, baseVersion: pick.i.version });
      return {
        data: { trip: pick.t!.title, date, changed: r.changed, changes: (r as { changes?: string[] }).changes ?? [], emergency: (r as { emergency?: unknown }).emergency ?? null, undo: 'The traveller can undo this in the itinerary.' },
        links: [{ label: 'Open the itinerary', to: `/trips/${pick.i.tripId}/itinerary` }],
      };
    }
    case 'start_cancellation': {
      const q = str('booking').toLowerCase().trim();
      if (q.length < 2) return { data: { error: 'Say which booking.' }, links: [] };
      const server = (await db.select().from(s.bookings).where(and(eq(s.bookings.userId, userId), eq(s.bookings.status, 'confirmed')))).find(
        (b) => (b.title ?? '').toLowerCase().includes(q) || (b.pnr ?? '').toLowerCase() === q,
      );
      if (server) {
        const r = await createQuote(userId, { bookingId: server.id });
        return {
          data: { booking: server.title, refundEstimateInr: r.estimate.refundInr, feeInr: r.estimate.feeInr, days: r.estimate.days, status: 'estimate only: not cancelled until the traveller confirms' },
          links: [{ label: 'Review and confirm', to: `/refunds/${r.request.id}` }],
        };
      }
      const recs = await db.select({ payload: s.userRecords.payload }).from(s.userRecords).where(and(eq(s.userRecords.userId, userId), eq(s.userRecords.tbl, 'bookings'), eq(s.userRecords.deleted, false)));
      const ext = recs
        .map((r) => r.payload as { id: string; tripId: string; title: string; status: string; pnr?: string })
        .find((b) => b.status === 'confirmed' && (b.title.toLowerCase().includes(q) || b.pnr?.toLowerCase() === q));
      if (!ext) return { data: { error: 'No confirmed booking matches that.' }, links: [] };
      return { data: { booking: ext.title, note: 'Open the booking to see the refund estimate and confirm.' }, links: [{ label: `Cancel ${ext.title}`, to: `/trips/${ext.tripId}/bookings/${ext.id}` }] };
    }
    case 'trip_budget': {
      const trips = await db.select().from(s.trips).where(eq(s.trips.userId, userId)).orderBy(asc(s.trips.startDate));
      const q = str('trip').toLowerCase();
      const today = new Date().toISOString().slice(0, 10);
      const t = trips.find((x) => q && (x.title.toLowerCase().includes(q) || x.destinationName.toLowerCase().includes(q))) ?? trips.find((x) => x.endDate >= today);
      if (!t) return { data: { error: 'No trip found.' }, links: [] };
      const recs = await db.select({ tbl: s.userRecords.tbl, payload: s.userRecords.payload }).from(s.userRecords).where(and(eq(s.userRecords.userId, userId), eq(s.userRecords.deleted, false)));
      const bookings = recs.filter((r) => r.tbl === 'bookings').map((r) => r.payload as { tripId: string; amount: number; status: string; refundInr?: number }).filter((b) => b.tripId === t.id);
      const expenses = recs.filter((r) => r.tbl === 'expenses').map((r) => r.payload as { tripId: string; amount: number }).filter((e) => e.tripId === t.id);
      return {
        data: {
          trip: t.title,
          budgetInr: t.budgetInr,
          bookedInr: bookings.filter((b) => b.status === 'confirmed').reduce((x, b) => x + b.amount, 0),
          savedOptionsInr: bookings.filter((b) => b.status === 'suggested').reduce((x, b) => x + b.amount, 0),
          refundedInr: bookings.reduce((x, b) => x + (b.refundInr ?? 0), 0),
          spentInr: expenses.reduce((x, e) => x + e.amount, 0),
        },
        links: [{ label: 'Open the budget', to: `/trips/${t.id}/budget` }],
      };
    }
    case 'flight_status': {
      const q = str('flight').toUpperCase().replace(/\s+/g, '');
      const recs = await db.select({ payload: s.userRecords.payload }).from(s.userRecords).where(and(eq(s.userRecords.userId, userId), eq(s.userRecords.tbl, 'flights'), eq(s.userRecords.deleted, false)));
      const f = recs.map((r) => r.payload as { flightNo: string; depart: string; arrive: string; fromCode: string; toCode: string; tripId: string }).find((x) => x.flightNo.toUpperCase().replace(/\s+/g, '') === q);
      return {
        data: f
          ? { flight: f.flightNo, route: `${f.fromCode}-${f.toCode}`, scheduledDeparture: f.depart, scheduledArrival: f.arrive, status: 'scheduled (demo: no live status provider)', note: 'Live delays and gates need an AeroDataBox or AviationStack key.' }
          : { error: 'That flight is not in your trips.', note: 'Live status needs an AeroDataBox or AviationStack key.' },
        links: f ? [{ label: 'Open flights', to: `/trips/${f.tripId}/flights` }] : [],
      };
    }
    default:
      return { data: { error: `Unknown tool ${name}` }, links: [] };
  }
}
