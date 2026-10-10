import { eq, inArray } from 'drizzle-orm';
import { getDb, schema as s, type Db } from './db/client';
import { estimateFare } from './flights';
import { destinationFit, derivePersona, type Persona } from '../src/engines/persona';
import { fitFor, type Fit } from '../src/engines/budget';

// "Where can I go for ₹X?", cheapest dates and over-budget suggestions. Costs come from
// the destination cost index (per person per day, by style) and the distance-based
// flight fare model; everything is labelled as an estimate.

export type Style = 'shoestring' | 'moderate' | 'comfort' | 'luxury';
const STYLES: Style[] = ['shoestring', 'moderate', 'comfort', 'luxury'];

/** How a day's typical spend splits by category (stay, food, local transport, activities). */
export const COST_SHARES = { stay: 0.45, food: 0.3, transport: 0.12, activities: 0.13 };

/** (Re)build the cost index from each destination's daily cost by style. Returns rows written. */
export async function refreshCostIndex(db: Db) {
  const dests = await db.select({ id: s.destinations.id, cost: s.destinations.dailyCostInr }).from(s.destinations);
  let n = 0;
  for (const d of dests) {
    if (!d.cost) continue;
    for (const style of STYLES) {
      const day = d.cost[style];
      const row = {
        destinationId: d.id,
        style,
        stay: Math.round(day * COST_SHARES.stay),
        food: Math.round(day * COST_SHARES.food),
        transport: Math.round(day * COST_SHARES.transport),
        activities: Math.round(day * COST_SHARES.activities),
        source: 'voyage-estimate-v1',
        sourceUrl: null,
        license: 'Voyage estimate from curated daily costs',
        fetchedAt: new Date(),
      };
      await db.insert(s.destinationCostIndex).values(row).onConflictDoUpdate({ target: [s.destinationCostIndex.destinationId, s.destinationCostIndex.style], set: row });
      n++;
    }
  }
  return n;
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

export interface Breakdown {
  travel: number;
  stay: number;
  food: number;
  local: number;
  activities: number;
  buffer: number;
  total: number;
}

export interface TripQuery {
  origin: string; // IATA
  days: number;
  travellers: number;
  style: Style;
  daysAhead?: number;
}

type Index = { stay: number; food: number; transport: number; activities: number };

/** Total trip cost for everyone: return flights, nights, food, local travel, activities, 5% buffer. */
export function costTrip(index: Index, flightPerPersonOneWay: number, q: TripQuery): Breakdown {
  const nights = Math.max(1, q.days - 1);
  const travel = flightPerPersonOneWay * 2 * q.travellers;
  // Rooms are shared: two people per room, so stay per person drops for pairs.
  const rooms = Math.ceil(q.travellers / 2);
  const stay = index.stay * 2 * rooms * nights * (q.travellers === 1 ? 0.75 : 1);
  const food = index.food * q.days * q.travellers;
  const local = index.transport * q.days * q.travellers;
  const activities = index.activities * q.days * q.travellers;
  const sub = travel + stay + food + local + activities;
  const buffer = sub * 0.05;
  const r = (n: number) => Math.round(n / 100) * 100;
  const parts = { travel: r(travel), stay: r(stay), food: r(food), local: r(local), activities: r(activities), buffer: r(buffer) };
  // The total is the sum of the rounded parts, so the breakdown always adds up.
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

/** One-way fare per person to a destination airport (0 when it is the same city). */
async function fares(db: Db, origin: string, airports: string[], style: Style, daysAhead: number) {
  const rows = await db.select().from(s.airports).where(inArray(s.airports.iata, [origin, ...airports]));
  const from = rows.find((a) => a.iata === origin);
  const out = new Map<string, number>();
  for (const a of rows) {
    if (!from || a.iata === origin) {
      out.set(a.iata, 0);
      continue;
    }
    const d = km(from, a);
    out.set(a.iata, estimateFare(d, { domestic: from.country === a.country, lowCost: style === 'shoestring' || style === 'moderate', stops: d > 5000 ? 1 : 0, daysAhead }).mid);
  }
  return { out, origin: from ?? null };
}

export interface WhereResult {
  slug: string;
  name: string;
  country: string;
  isDomestic: boolean;
  bestTime: string | null;
  imageThumbUrl: string | null;
  breakdown: Breakdown;
  fit: Fit;
  personaFit: number;
  valueScore: number;
}

export async function whereCanIGo(budget: number, q: TripQuery, persona: Persona | null) {
  const { db } = await getDb();
  const dests = await db.select().from(s.destinations);
  const index = await db.select().from(s.destinationCostIndex).where(eq(s.destinationCostIndex.style, q.style));
  const byDest = new Map(index.map((i) => [i.destinationId, i]));
  const { out: fare, origin } = await fares(db, q.origin, dests.map((d) => d.airportIata).filter((a): a is string => !!a), q.style, q.daysAhead ?? 30);
  const results: WhereResult[] = [];
  for (const d of dests) {
    const idx = byDest.get(d.id);
    if (!idx || !d.airportIata) continue;
    const breakdown = costTrip(idx, fare.get(d.airportIata) ?? 0, q);
    const personaFit = persona ? destinationFit(d.personaTags, persona) : 0;
    results.push({
      slug: d.slug,
      name: d.name,
      country: d.country,
      isDomestic: d.isDomestic,
      bestTime: d.bestTime,
      imageThumbUrl: d.imageThumbUrl,
      breakdown,
      fit: fitFor(breakdown.total, budget),
      personaFit,
      // Best value: how much of what suits the traveller per rupee (featured places a little higher).
      valueScore: Math.round(((1 + personaFit + (d.featured ? 0.5 : 0)) / breakdown.total) * 1e6),
    });
  }
  return { origin: origin ? { iata: origin.iata, city: origin.city } : null, results };
}

/** Day-of-week effect on fares (Fridays and Sundays dearer, mid-week cheaper). */
const DOW = [1.08, 0.98, 0.92, 0.93, 1.0, 1.12, 1.02]; // Sun..Sat

/** Estimated fare per person for each day around a date, for a price calendar. */
export async function cheapestDates(origin: string, dest: string, center: string, travellers: number, spread = 10) {
  const { db } = await getDb();
  const rows = await db.select().from(s.airports).where(inArray(s.airports.iata, [origin, dest]));
  const a = rows.find((r) => r.iata === origin);
  const b = rows.find((r) => r.iata === dest);
  if (!a || !b) return null;
  const d = km(a, b);
  const today = new Date().toISOString().slice(0, 10);
  const days: { date: string; pricePerPerson: number; total: number }[] = [];
  for (let i = -spread; i <= spread; i++) {
    const date = new Date(Date.parse(`${center}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    if (date < today) continue;
    const ahead = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
    const base = estimateFare(d, { domestic: a.country === b.country, lowCost: true, stops: d > 5000 ? 1 : 0, daysAhead: ahead }).mid;
    const p = Math.round((base * DOW[new Date(`${date}T00:00:00Z`).getUTCDay()]) / 50) * 50;
    days.push({ date, pricePerPerson: p, total: p * travellers });
  }
  const chosen = days.find((x) => x.date === center) ?? days[0];
  const cheapest = [...days].sort((x, y) => x.total - y.total)[0];
  return {
    days,
    chosen,
    cheapest,
    saving: chosen && cheapest ? Math.max(0, chosen.total - cheapest.total) : 0,
    shiftDays: chosen && cheapest ? Math.round((Date.parse(cheapest.date) - Date.parse(chosen.date)) / 86_400_000) : 0,
    note: 'Estimated one-way economy fares (distance and day-of-week model). Live fares need Amadeus or Travelpayouts keys.',
  };
}

export interface Cut {
  kind: 'dates' | 'nearby' | 'nights' | 'train' | 'style';
  title: string;
  saving: number;
  detail: string;
}

/** Concrete ways to bring a trip back under budget, biggest saving first. */
export async function budgetCuts(slug: string, budget: number, q: TripQuery & { date?: string }): Promise<{ current: Breakdown; overBy: number; cuts: Cut[] } | null> {
  const { db } = await getDb();
  const [d] = await db.select().from(s.destinations).where(eq(s.destinations.slug, slug)).limit(1);
  if (!d?.airportIata) return null;
  const idxRows = await db.select().from(s.destinationCostIndex).where(eq(s.destinationCostIndex.destinationId, d.id));
  const idx = idxRows.find((r) => r.style === q.style);
  if (!idx) return null;
  const { out: fare } = await fares(db, q.origin, [d.airportIata], q.style, q.daysAhead ?? 30);
  const oneWay = fare.get(d.airportIata) ?? 0;
  const current = costTrip(idx, oneWay, q);
  const cuts: Cut[] = [];

  if (q.days > 2) {
    const shorter = costTrip(idx, oneWay, { ...q, days: q.days - 1 });
    cuts.push({ kind: 'nights', title: 'One night fewer', saving: current.total - shorter.total, detail: `${q.days - 1} days instead of ${q.days}` });
  }
  const cheaperStyle = { comfort: 'moderate', luxury: 'comfort', moderate: 'shoestring', shoestring: null }[q.style] as Style | null;
  const cheaperIdx = cheaperStyle && idxRows.find((r) => r.style === cheaperStyle);
  if (cheaperStyle && cheaperIdx) {
    const c = costTrip(cheaperIdx, oneWay, { ...q, style: cheaperStyle });
    cuts.push({ kind: 'style', title: `Stay and eat ${cheaperStyle === 'shoestring' ? 'on a shoestring' : cheaperStyle}`, saving: current.total - c.total, detail: 'Simpler hotels and local eateries' });
  }
  if (q.date) {
    const cal = await cheapestDates(q.origin, d.airportIata, q.date, q.travellers, 5);
    if (cal && cal.saving > 0) {
      cuts.push({ kind: 'dates', title: `Shift ${Math.abs(cal.shiftDays)} day${Math.abs(cal.shiftDays) === 1 ? '' : 's'} ${cal.shiftDays > 0 ? 'later' : 'earlier'}`, saving: cal.saving * 2, detail: `Leave on ${cal.cheapest.date} (return assumed similar)` });
    }
  }
  // Train instead of flight for shorter Indian trips (3AC is roughly ₹1.6 per km).
  const ports = await db.select().from(s.airports).where(inArray(s.airports.iata, [q.origin, d.airportIata]));
  const a = ports.find((p) => p.iata === q.origin);
  const b = ports.find((p) => p.iata === d.airportIata);
  if (a && b && a.country === 'India' && b.country === 'India' && a.iata !== b.iata) {
    const dist = km(a, b) * 1.25;
    if (dist < 1500) {
      const train = Math.round((dist * 1.6 + 150) / 50) * 50;
      const saving = (oneWay - train) * 2 * q.travellers;
      if (saving > 0) cuts.push({ kind: 'train', title: 'Take the train (3AC)', saving, detail: `About ${Math.round(dist / 55)} h each way, ~₹${train.toLocaleString('en-IN')} per person` });
    }
  }
  // A cheaper destination with a similar feel nearby.
  const others = await db.select().from(s.destinations).where(eq(s.destinations.region, d.region));
  const otherIdx = await db.select().from(s.destinationCostIndex).where(eq(s.destinationCostIndex.style, q.style));
  const ix = new Map(otherIdx.map((i) => [i.destinationId, i]));
  const { out: otherFares } = await fares(db, q.origin, others.map((o) => o.airportIata).filter((x): x is string => !!x), q.style, q.daysAhead ?? 30);
  const alt = others
    .filter((o) => o.id !== d.id && o.airportIata && ix.get(o.id))
    .map((o) => ({ o, cost: costTrip(ix.get(o.id)!, otherFares.get(o.airportIata!) ?? 0, q) }))
    .sort((x, y) => x.cost.total - y.cost.total)[0];
  if (alt && alt.cost.total < current.total) cuts.push({ kind: 'nearby', title: `Go to ${alt.o.name} instead`, saving: current.total - alt.cost.total, detail: `Similar region, about ₹${alt.cost.total.toLocaleString('en-IN')} in total` });

  return { current, overBy: Math.max(0, current.total - budget), cuts: cuts.filter((c) => c.saving > 0).sort((x, y) => y.saving - x.saving) };
}

export const personaFrom = (answers: Record<string, string> | null) => (answers ? derivePersona(answers) : null);
export const fitBudget = (total: number, budget: number) => fitFor(total, budget);
