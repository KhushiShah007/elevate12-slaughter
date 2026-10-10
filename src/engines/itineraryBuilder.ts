import type { Accommodation, Experience, ItineraryDay, ItineraryItem, Restaurant, Trip } from '../types';
import { orderExperiences, orderRestaurants, type Persona } from './persona';

// Builds a day-by-day plan: what the traveller already booked stays as it is, and free
// time is filled from the persona (how many plans a day, interests first, veg meals,
// rest breaks). Only places in the city they sleep in that night are suggested.

export type PlanNote = 'match' | 'veg' | 'jain' | 'rest';

export interface PlannedItem {
  id: string;
  time: string; // HH:MM
  title: string;
  kind: ItineraryItem['kind'];
  suggested: boolean;
  note?: PlanNote;
}

export interface PlannedDay {
  date: string; // YYYY-MM-DD
  title: string;
  region: string | null;
  travelDay: boolean;
  items: PlannedItem[];
}

export interface BuildInput {
  trip: Trip;
  days: ItineraryDay[];
  items: ItineraryItem[];
  stays: Accommodation[];
  experiences: Experience[];
  restaurants: Restaurant[];
  persona: Persona;
  /** Places close enough to a city for a day out, e.g. { Kyoto: ['Nara', 'Uji'] }. */
  nearby?: Record<string, string[]>;
}

const SIGHT_SLOTS = ['10:00', '15:30', '11:30', '17:30'];
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const near = (a: string, b: string, within: number) => Math.abs(toMin(a) - toMin(b)) < within;

function datesBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startIso.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${endIso.slice(0, 10)}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** City of the stay that covers this night ("Shinjuku, Tokyo" -> "Tokyo"). */
function regionFor(date: string, stays: Accommodation[]): string | null {
  const sorted = [...stays].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const stay = sorted.find((s) => s.checkIn.slice(0, 10) <= date && date < s.checkOut.slice(0, 10)) ?? sorted[sorted.length - 1];
  return stay ? (stay.area.split(',').pop()?.trim() ?? null) : null;
}

function inRegion(area: string, region: string | null, nearby: Record<string, string[]>): boolean {
  if (!region) return false;
  return area.includes(region) || (nearby[region] ?? []).some((p) => area.includes(p));
}

export function buildItinerary(input: BuildInput): PlannedDay[] {
  const { trip, persona, nearby = {} } = input;
  const dates = datesBetween(trip.startDate, trip.endDate);
  const used = new Set(input.items.map((i) => i.title.toLowerCase()));
  const restaurantsUsed = new Set<string>();
  const ranked = orderExperiences(input.experiences, persona);
  const restaurants = orderRestaurants(input.restaurants, persona).filter((r) => !persona.vegFirst || r.veg);

  return dates.map((date, index) => {
    const day = input.days.find((d) => d.date.slice(0, 10) === date);
    const booked: PlannedItem[] = (day ? input.items.filter((i) => i.dayId === day.id) : []).map((i) => ({
      id: i.id,
      time: i.time,
      title: i.title,
      kind: i.kind,
      suggested: false,
    }));
    const region = regionFor(date, input.stays);
    const travelDay = index === 0 || index === dates.length - 1 || booked.some((i) => i.kind === 'flight');
    const items = [...booked];
    let n = 0;
    const add = (time: string, title: string, kind: PlannedItem['kind'], note?: PlanNote) =>
      items.push({ id: `s-${date}-${n++}`, time, title, kind, suggested: true, note });
    const free = (time: string) => !items.some((i) => near(i.time, time, 75));

    if (!travelDay) {
      // Sights: up to the persona's plans per day, counting what is already booked.
      let room = persona.activitiesPerDay - booked.filter((i) => i.kind === 'see').length;
      for (const { item, match } of ranked) {
        if (room <= 0) break;
        if (used.has(item.title.toLowerCase()) || !inRegion(item.area, region, nearby)) continue;
        const slot = SIGHT_SLOTS.find(free);
        if (!slot) break;
        add(slot, item.title, 'see', match ? 'match' : undefined);
        used.add(item.title.toLowerCase());
        room--;
      }

      // Slow and family trips get an afternoon break.
      if ((persona.id === 'slow' || persona.id === 'family') && free('14:30')) add('14:30', 'Rest at the hotel', 'stay', 'rest');

      // Lunch if nothing is planned around midday; dinner too for food lovers.
      const meals = persona.id === 'foodie' ? ['13:00', '19:30'] : ['13:00'];
      for (const time of meals) {
        if (!free(time)) continue;
        const place =
          restaurants.find((r) => inRegion(r.area, region, nearby) && !restaurantsUsed.has(r.id)) ?? restaurants.find((r) => inRegion(r.area, region, nearby));
        if (!place) continue;
        restaurantsUsed.add(place.id);
        add(time, `${time === '13:00' ? 'Lunch' : 'Dinner'} at ${place.name}`, 'food', persona.jain ? 'jain' : persona.vegFirst ? 'veg' : undefined);
      }
    }

    items.sort((a, b) => a.time.localeCompare(b.time));
    return {
      date,
      title: day?.title ?? (travelDay ? 'Travel day' : region ? `A day in ${region}` : 'Free day'),
      region,
      travelDay,
      items,
    };
  });
}
