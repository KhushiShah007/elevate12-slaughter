// Deterministic itinerary planner and "Today mode" adaptation. Pure functions shared by
// the server and the app. No AI: places, times, costs and intensity come from data and
// rules; an LLM may only add descriptions later.

export type ItemType = 'experience' | 'restaurant' | 'transport' | 'rest' | 'free';
export type ItemStatus = 'planned' | 'done' | 'skipped' | 'postponed';

export interface PlanItem {
  id: string;
  type: ItemType;
  title: string;
  start: string; // HH:MM
  end: string; // HH:MM
  placeId?: string | null; // guide place id ("see-12", "eat-40")
  category?: string | null;
  lat?: number | null;
  lon?: number | null;
  costPerPerson: number; // INR estimate (0 = free)
  intensity: number; // 1 (easy) .. 5 (strenuous)
  indoor: boolean;
  travelMinFromPrev: number;
  bookingId?: string | null; // a paid booking this item belongs to
  bookingRefundable?: boolean | null;
  link?: string | null; // map or booking link
  locked: boolean;
  status: ItemStatus;
  note?: string | null;
}

export interface PlanDay {
  date: string; // yyyy-mm-dd
  title: string;
  kind: 'arrival' | 'full' | 'departure';
  rainLikely: boolean;
  items: PlanItem[];
}

export interface Plan {
  days: PlanDay[];
  postponed: PlanItem[];
}

export interface Place {
  id: string; // "see-12" / "eat-40"
  kind: 'see' | 'eat';
  name: string;
  category: string | null;
  lat: number | null;
  lon: number | null;
  openingHours: string | null;
  entry: 'free' | 'paid' | null;
  costRange: [number, number] | null; // meals
  vegetarian: boolean | null;
  score: number; // higher = suits the traveller better
  link: string;
}

export interface PlanInput {
  startDate: string;
  endDate: string;
  places: Place[];
  /** Per person per day. */
  allowance: { meal: number; activities: number };
  maxIntensityPerDay: number; // e.g. 6 slow, 9 balanced, 12 packed
  restBreak: boolean; // families and slow travellers
  vegOnly: boolean;
  rainDates?: string[]; // forecast: rain likely
  /** Ticket estimate for paid sights when the price is unknown (per person). */
  paidEntryEstimate: number;
}

// ---------- Place facts ----------

const INTENSITY: Record<string, number> = {
  museum: 2,
  gallery: 2,
  monument: 2,
  attraction: 2,
  artwork: 1,
  castle: 4,
  fort: 4,
  ruins: 3,
  archaeological_site: 3,
  viewpoint: 3,
  zoo: 3,
  theme_park: 4,
  information: 1,
};
const INDOOR = new Set(['museum', 'gallery', 'restaurant', 'cafe', 'quick', 'theme_park_indoor']);
const DURATION: Record<string, number> = { museum: 90, gallery: 60, monument: 45, attraction: 60, castle: 120, fort: 120, ruins: 75, archaeological_site: 90, viewpoint: 45, zoo: 150, theme_park: 180 };

export const intensityOf = (p: Place) => (p.kind === 'eat' ? 1 : (INTENSITY[p.category ?? ''] ?? 2));
export const indoorOf = (p: Place) => (p.kind === 'eat' ? true : INDOOR.has(p.category ?? ''));
const durationOf = (p: Place) => (p.kind === 'eat' ? (p.category === 'cafe' ? 45 : 75) : (DURATION[p.category ?? ''] ?? 60));

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const km = (a: { lat?: number | null; lon?: number | null }, b: { lat?: number | null; lon?: number | null }) => {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return 3;
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3;
};
/** City travel time: about 20 km/h door to door, plus 10 minutes to get going. */
export const travelMin = (a: Parameters<typeof km>[0], b: Parameters<typeof km>[0]) => Math.round((km(a, b) / 20) * 60 + 10);

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Is the place open on that date from start to end? Unknown hours count as open. */
export function isOpen(hours: string | null, date: string, start: string, end: string): boolean {
  if (!hours || /24\/7/.test(hours)) return true;
  const dow = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const rules = hours.split(';').map((r) => r.trim());
  let verdict: boolean | null = null;
  for (const rule of rules) {
    const m = rule.match(/^([A-Za-z]{2}(?:\s*[-,]\s*[A-Za-z]{2})*)\s+(.+)$/);
    const daysPart = m ? m[1] : 'Mo-Su';
    const rest = m ? m[2] : rule;
    if (!dayMatches(daysPart, dow)) continue;
    if (/off|closed/i.test(rest)) {
      verdict = false;
      continue;
    }
    const spans = [...rest.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];
    if (!spans.length) continue;
    verdict = spans.some(([, a, b]) => toMin(a) <= toMin(start) && toMin(end) <= (toMin(b) || 24 * 60));
  }
  return verdict ?? true;
}
function dayMatches(spec: string, dow: string) {
  return spec.split(',').some((part) => {
    const [a, b] = part.split('-').map((x) => x.trim().slice(0, 2));
    if (!b) return a === dow;
    const i = DAYS.indexOf(a);
    const j = DAYS.indexOf(b);
    const k = DAYS.indexOf(dow);
    if (i < 0 || j < 0) return false;
    return i <= j ? k >= i && k <= j : k >= i || k <= j;
  });
}

const costOf = (p: Place, paidEntry: number) => (p.kind === 'eat' ? Math.round(((p.costRange?.[0] ?? 0) + (p.costRange?.[1] ?? 0)) / 2) : p.entry === 'paid' ? paidEntry : 0);

function itemFrom(p: Place, start: number, prev: { lat?: number | null; lon?: number | null } | null, paidEntry: number, note?: string): PlanItem {
  const dur = durationOf(p);
  return {
    id: `i-${p.id}-${start}`,
    type: p.kind === 'eat' ? 'restaurant' : 'experience',
    title: p.kind === 'eat' ? `${start < 16 * 60 ? 'Lunch' : 'Dinner'} at ${p.name}` : p.name,
    start: toTime(start),
    end: toTime(start + dur),
    placeId: p.id,
    category: p.category,
    lat: p.lat,
    lon: p.lon,
    costPerPerson: costOf(p, paidEntry),
    intensity: intensityOf(p),
    indoor: indoorOf(p),
    travelMinFromPrev: prev ? travelMin(prev, p) : 0,
    link: p.link,
    locked: false,
    status: 'planned',
    note: note ?? null,
  };
}

const restItem = (start: number, minutes: number, title = 'Rest at the hotel'): PlanItem => ({
  id: `rest-${start}`,
  type: 'rest',
  title,
  start: toTime(start),
  end: toTime(start + minutes),
  costPerPerson: 0,
  intensity: 1,
  indoor: true,
  travelMinFromPrev: 0,
  locked: false,
  status: 'planned',
});

function datesBetween(a: string, b: string) {
  const out: string[] = [];
  for (let d = Date.parse(`${a}T00:00:00Z`); d <= Date.parse(`${b}T00:00:00Z`); d += 86_400_000) out.push(new Date(d).toISOString().slice(0, 10));
  return out;
}

// ---------- Initial plan ----------

/** Build the whole trip: sights clustered by area each day, meals at meal times, rests, budget and hours respected. */
export function planTrip(input: PlanInput): Plan {
  const dates = datesBetween(input.startDate.slice(0, 10), input.endDate.slice(0, 10));
  const used = new Set<string>();
  const sights = input.places.filter((p) => p.kind === 'see').sort((a, b) => b.score - a.score);
  // Vegetarian travellers: places marked vegetarian first; places with no diet info still
  // count (most listings say nothing); places marked non-vegetarian never.
  const eats = input.places
    .filter((p) => p.kind === 'eat' && (!input.vegOnly || p.vegetarian !== false))
    .sort((a, b) => (input.vegOnly ? Number(!!b.vegetarian) - Number(!!a.vegetarian) : 0) || b.score - a.score);
  const rain = new Set(input.rainDates ?? []);

  const days: PlanDay[] = dates.map((date, i) => {
    const kind: PlanDay['kind'] = dates.length > 1 && i === 0 ? 'arrival' : dates.length > 1 && i === dates.length - 1 ? 'departure' : 'full';
    const rainLikely = rain.has(date);
    const items: PlanItem[] = [];
    // Arrival days start in the afternoon; departure days end by early afternoon.
    let clock = kind === 'arrival' ? 15 * 60 : 9 * 60 + 30;
    const endOfDay = kind === 'departure' ? 13 * 60 : 20 * 60 + 30;
    const cap = kind === 'full' ? input.maxIntensityPerDay : Math.ceil(input.maxIntensityPerDay / 2);
    let intensity = 0;
    let spend = 0;
    const budget = input.allowance.activities + input.allowance.meal * 2;
    let prev: { lat?: number | null; lon?: number | null } | null = null;
    let lunch = kind === 'arrival';
    let dinner = kind === 'departure';
    let rested = !input.restBreak || kind !== 'full';

    const addMeal = (label: 'lunch' | 'dinner') => {
      // Within the meal allowance first, then the nearest.
      const fits = (e: Place) => Number(costOf(e, 0) <= input.allowance.meal);
      const pick = eats.filter((e) => !used.has(e.id)).sort((a, b) => fits(b) - fits(a) || (prev ? km(prev, a) - km(prev, b) : 0))[0] ?? eats[0];
      if (!pick) return;
      used.add(pick.id);
      const start = Math.max(clock, label === 'lunch' ? 13 * 60 : 19 * 60 + 30);
      const it = itemFrom(pick, start, prev, input.paidEntryEstimate);
      it.title = `${label === 'lunch' ? 'Lunch' : 'Dinner'} at ${pick.name}`;
      items.push(it);
      spend += it.costPerPerson;
      clock = toMin(it.end);
      prev = pick;
    };

    for (let guard = 0; guard < 12 && clock < endOfDay; guard++) {
      if (!lunch && clock >= 12 * 60 + 30) {
        addMeal('lunch');
        lunch = true;
        continue;
      }
      if (!rested && clock >= 14 * 60) {
        items.push(restItem(clock + 15, 90));
        clock += 105;
        rested = true;
        continue;
      }
      if (!dinner && clock >= 19 * 60) {
        addMeal('dinner');
        dinner = true;
        continue;
      }
      // Next sight: the nearest unused one (area clustering), preferring indoor when it rains.
      const pool = sights.filter((p) => !used.has(p.id) && intensity + intensityOf(p) <= cap && (!rainLikely || indoorOf(p)));
      const ordered: Place[] = prev ? [...pool].sort((a, b) => km(prev!, a) - km(prev!, b) || b.score - a.score) : pool;
      const next: Place | undefined = ordered.find((p: Place) => {
        const start = clock + (prev ? travelMin(prev, p) : 0);
        const cost = costOf(p, input.paidEntryEstimate);
        return isOpen(p.openingHours, date, toTime(start), toTime(start + durationOf(p))) && spend + cost <= budget && start + durationOf(p) <= endOfDay;
      });
      if (!next) {
        if (!lunch) {
          clock = Math.max(clock, 13 * 60);
          continue;
        }
        if (!dinner && kind !== 'departure') {
          clock = Math.max(clock, 19 * 60 + 30);
          continue;
        }
        break;
      }
      const start = clock + (prev ? travelMin(prev, next) : 0);
      const it = itemFrom(next, start, prev, input.paidEntryEstimate);
      used.add(next.id);
      items.push(it);
      intensity += it.intensity;
      spend += it.costPerPerson;
      clock = toMin(it.end) + 15;
      prev = next;
    }
    return { date, title: kind === 'arrival' ? 'Arrive and settle in' : kind === 'departure' ? 'Last morning and departure' : rainLikely ? 'A rainy-day plan' : 'A day out', kind, rainLikely, items };
  });
  return { days, postponed: [] };
}

// ---------- Today mode ----------

export type AdaptMode = 'sick' | 'tired' | 'lighter' | 'rain' | 'late' | 'skip' | 'add' | 'overspend';

export interface AdaptOptions {
  date: string;
  itemId?: string; // skip
  minutes?: number; // late
  place?: Place; // add
  pool?: Place[]; // alternatives (unused guide places)
  allowance?: { meal: number; activities: number };
  paidEntryEstimate?: number;
}

export interface AdaptResult {
  plan: Plan;
  changes: string[];
  warnings: { itemId: string; title: string; bookingId: string; message: string }[];
}

const clone = (p: Plan): Plan => JSON.parse(JSON.stringify(p)) as Plan;

function retime(items: PlanItem[], from = 0) {
  // Keep order; make sure nothing overlaps (locked items keep their time).
  let clock = from;
  for (const it of items.filter((i) => i.status === 'planned')) {
    const dur = toMin(it.end) - toMin(it.start);
    if (!it.locked && toMin(it.start) < clock) {
      it.start = toTime(clock);
      it.end = toTime(clock + dur);
    }
    clock = toMin(it.end) + 10;
  }
}

/** Replan a day for how the traveller feels or what happened. Locked items never change. */
export function adaptDay(plan: Plan, mode: AdaptMode, o: AdaptOptions): AdaptResult {
  const next = clone(plan);
  const di = next.days.findIndex((d) => d.date === o.date);
  if (di < 0) return { plan: next, changes: [], warnings: [] };
  const day = next.days[di];
  const changes: string[] = [];
  const warnings: AdaptResult['warnings'] = [];
  const active = () => day.items.filter((i) => i.status === 'planned');
  const usedIds = new Set(next.days.flatMap((d) => d.items.map((i) => i.placeId)).filter(Boolean));
  const pool = (o.pool ?? []).filter((p) => !usedIds.has(p.id));

  const warnIfBooked = (it: PlanItem) => {
    if (it.bookingId) warnings.push({ itemId: it.id, title: it.title, bookingId: it.bookingId, message: it.bookingRefundable === false ? `${it.title} is paid and non-refundable.` : `${it.title} is a paid booking: cancel it to get money back.` });
  };

  /** Move an item to a later day with room, else to Postponed. */
  const postpone = (it: PlanItem) => {
    warnIfBooked(it);
    it.status = 'postponed';
    for (let j = di + 1; j < next.days.length; j++) {
      const later = next.days[j];
      if (later.kind === 'departure') continue;
      const load = later.items.filter((i) => i.status === 'planned').reduce((s, i) => s + i.intensity, 0);
      if (load + it.intensity <= 9) {
        const copy: PlanItem = { ...it, id: `${it.id}-m${j}`, status: 'planned', start: '16:00', end: toTime(toMin('16:00') + (toMin(it.end) - toMin(it.start))) };
        later.items.push(copy);
        later.items.sort((a, b) => a.start.localeCompare(b.start));
        retime(later.items);
        changes.push(`Moved ${it.title} to ${later.date}`);
        return;
      }
    }
    next.postponed.push({ ...it });
    changes.push(`Postponed ${it.title}`);
  };

  if (mode === 'sick' || mode === 'tired' || mode === 'lighter') {
    const original = active().reduce((s, i) => s + i.intensity, 0);
    // Sick: only easy, nearby things. Tired/lighter: about 60% of the day's effort.
    const cap = mode === 'sick' ? 3 : Math.max(2, Math.floor(original * 0.6));
    const removable = active()
      .filter((i) => !i.locked && (i.type === 'experience' || i.type === 'transport'))
      .sort((a, b) => b.intensity - a.intensity);
    let load = original;
    for (const it of removable) {
      if (mode === 'sick' ? it.intensity <= 1 : load <= cap) continue;
      load -= it.intensity;
      postpone(it);
    }
    if (mode === 'sick') {
      day.items.push({ ...restItem(toMin('10:00'), 240, 'Rest and recover'), id: `rest-sick-${o.date}` }, { ...restItem(toMin('18:00'), 60, 'Nearest pharmacy or clinic if needed'), id: `care-${o.date}`, type: 'free', note: 'pharmacy' });
      changes.push('Added rest; strenuous plans moved; nearest pharmacy and hospital shown');
    } else {
      // Something gentle and indoors instead: a café or a museum.
      const gentle = pool.filter((p) => indoorOf(p) && intensityOf(p) <= 2).sort((a, b) => b.score - a.score)[0];
      if (gentle) {
        day.items.push(itemFrom(gentle, toMin('15:30'), null, o.paidEntryEstimate ?? 0, 'lighter'));
        changes.push(`Added ${gentle.name} (easy, indoors)`);
      }
      day.items.push({ ...restItem(toMin('14:00'), 90), id: `rest-light-${o.date}` });
      changes.push('Added a rest at the hotel');
    }
    day.title = mode === 'sick' ? 'Rest day' : 'An easier day';
  }

  if (mode === 'rain') {
    for (const it of active().filter((i) => !i.indoor && !i.locked && i.type === 'experience')) {
      const alt = pool.find((p) => p.kind === 'see' && indoorOf(p) && !usedIds.has(p.id));
      if (alt) {
        usedIds.add(alt.id);
        const swap = itemFrom(alt, toMin(it.start), null, o.paidEntryEstimate ?? 0, 'rain');
        it.status = 'postponed';
        warnIfBooked(it);
        day.items.push(swap);
        changes.push(`Swapped ${it.title} for ${alt.name} (indoors)`);
      } else postpone(it);
    }
    day.rainLikely = true;
  }

  if (mode === 'late') {
    const shift = o.minutes ?? 60;
    const nowItems = active().filter((i) => !i.locked);
    for (const it of nowItems) {
      it.start = toTime(toMin(it.start) + shift);
      it.end = toTime(toMin(it.end) + shift);
    }
    changes.push(`Shifted today by ${shift} min`);
    // Drop the least important things that now run too late.
    for (const it of [...nowItems].reverse()) {
      if (toMin(it.end) <= 21 * 60 + 30) break;
      if (it.type === 'restaurant') continue;
      postpone(it);
    }
  }

  if (mode === 'skip' && o.itemId) {
    const it = day.items.find((i) => i.id === o.itemId);
    if (it && !it.locked) {
      warnIfBooked(it);
      it.status = 'skipped';
      changes.push(`Skipped ${it.title}`);
    }
  }

  if (mode === 'add' && o.place) {
    const last = active()[active().length - 1];
    const start = o.place.kind === 'eat' ? (active().some((i) => i.type === 'restaurant' && i.start < '16:00') ? toMin('19:30') : toMin('13:00')) : last ? toMin(last.end) + 15 : toMin('10:00');
    day.items.push(itemFrom(o.place, start, last ?? null, o.paidEntryEstimate ?? 0));
    changes.push(`Added ${o.place.name}`);
  }

  if (mode === 'overspend' && o.allowance) {
    const limit = o.allowance.activities;
    for (const it of active().filter((i) => !i.locked && i.costPerPerson > limit / 2)) {
      const cheaper = pool
        .filter((p) => (it.type === 'restaurant' ? p.kind === 'eat' : p.kind === 'see') && costOf(p, o.paidEntryEstimate ?? 0) < it.costPerPerson)
        .sort((a, b) => costOf(a, o.paidEntryEstimate ?? 0) - costOf(b, o.paidEntryEstimate ?? 0) || b.score - a.score)[0];
      if (!cheaper) continue;
      warnIfBooked(it);
      it.status = 'postponed';
      const swap = itemFrom(cheaper, toMin(it.start), null, o.paidEntryEstimate ?? 0, 'cheaper');
      if (it.type === 'restaurant') swap.title = it.title.replace(/ at .+$/, ` at ${cheaper.name}`);
      day.items.push(swap);
      usedIds.add(cheaper.id);
      changes.push(`Swapped ${it.title} for ${cheaper.name} (cheaper)`);
    }
  }

  day.items.sort((a, b) => a.start.localeCompare(b.start));
  retime(day.items);
  return { plan: next, changes, warnings };
}

/** Plain-language diff between two plans ("moved museum to Day 3, added café"). */
export function diffPlans(before: Plan, after: Plan): string[] {
  const key = (i: PlanItem) => i.placeId ?? i.title;
  const where = (p: Plan) => {
    const m = new Map<string, string>();
    p.days.forEach((d) => d.items.filter((i) => i.status === 'planned').forEach((i) => m.set(key(i), d.date)));
    return m;
  };
  const a = where(before);
  const b = where(after);
  const out: string[] = [];
  const title = (p: Plan, k: string) => p.days.flatMap((d) => d.items).find((i) => key(i) === k)?.title ?? k;
  for (const [k, d] of b) if (!a.has(k)) out.push(`Added ${title(after, k)} on ${d}`);
  for (const [k, d] of a) {
    if (!b.has(k)) out.push(`Removed ${title(before, k)} from ${d}`);
    else if (b.get(k) !== d) out.push(`Moved ${title(after, k)} from ${d} to ${b.get(k)}`);
  }
  return out;
}

/** Local emergency numbers (police / ambulance) by country. */
export const EMERGENCY: Record<string, { all?: string; police?: string; ambulance?: string }> = {
  India: { all: '112', ambulance: '108' },
  'United Arab Emirates': { police: '999', ambulance: '998' },
  Singapore: { police: '999', ambulance: '995' },
  Thailand: { police: '191', ambulance: '1669' },
  Indonesia: { all: '112', ambulance: '118' },
  Malaysia: { all: '999' },
  Vietnam: { police: '113', ambulance: '115' },
  Maldives: { police: '119', ambulance: '102' },
  Nepal: { police: '100', ambulance: '102' },
  'Sri Lanka': { police: '119', ambulance: '1990' },
  Japan: { police: '110', ambulance: '119' },
  'South Korea': { police: '112', ambulance: '119' },
  'Hong Kong': { all: '999' },
  Türkiye: { all: '112' },
  France: { all: '112' },
  'United Kingdom': { all: '999' },
  Italy: { all: '112' },
  Switzerland: { all: '112', ambulance: '144' },
  'United States': { all: '911' },
  Australia: { all: '000' },
};
