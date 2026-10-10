import { db } from '../db';
import { adjustedSteps, eventFromStatuses, runCascade } from '../../engines/cascade';
import { minutesBetween } from '../../engines/time';
import { removeAndQueue, writeAndQueue } from '../syncQueue';
import type { RiskLevel, Trip } from '../../types';

export const listTrips = () => db.trips.toArray();

export interface NewTripInput {
  title: string;
  from: string;
  to: string;
  destinationSlug?: string | null;
  startDate: string; // yyyy-mm-dd
  endDate: string;
  travellers: number;
  budgetInr?: number | null;
}

/** Problems with a new trip, by field. Empty when it can be saved. */
export function checkNewTrip(t: Partial<NewTripInput>, today = new Date().toISOString().slice(0, 10)) {
  const errors: Partial<Record<keyof NewTripInput, string>> = {};
  if (!t.to?.trim()) errors.to = 'Where are you going?';
  if (!t.startDate) errors.startDate = 'Pick a start date.';
  else if (t.startDate < today) errors.startDate = 'The start date has passed.';
  if (!t.endDate) errors.endDate = 'Pick a return date.';
  else if (t.startDate && t.endDate < t.startDate) errors.endDate = 'Return is before the start.';
  if (!t.travellers || t.travellers < 1 || t.travellers > 20) errors.travellers = 'Between 1 and 20 travellers.';
  if (t.budgetInr != null && (t.budgetInr < 0 || !Number.isFinite(t.budgetInr))) errors.budgetInr = 'Enter an amount in rupees.';
  return errors;
}

/** Save a new trip on the device and queue it for the account (works offline). */
export async function createTrip(input: NewTripInput) {
  const trip: Trip = {
    id: crypto.randomUUID(),
    title: input.title.trim() || `${input.to.trim()} trip`,
    from: input.from.trim(),
    to: input.to.trim(),
    destinationSlug: input.destinationSlug ?? null,
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'upcoming',
    travellers: input.travellers,
    budgetInr: input.budgetInr ?? null,
    createdAt: new Date().toISOString(),
  };
  await writeAndQueue('trips', trip.id, trip, `New trip: ${trip.title}`);
  return trip;
}

export async function deleteTrip(trip: Trip) {
  await removeAndQueue('trips', trip.id, `Deleted trip: ${trip.title}`);
}

/** Everything one trip owns. Data is always looked up by tripId, never shared. */
export async function getTripBundle(tripId: string) {
  const trip = await db.trips.get(tripId);
  if (!trip) return null;
  const byTrip = { tripId };
  const [flights, bookings, accommodations, transport, experiences, restaurants, days, items, expenses, documents, memory, steps, progress, pickup, statuses] =
    await Promise.all([
      db.flights.where(byTrip).sortBy('depart'),
      db.bookings.where(byTrip).toArray(),
      db.accommodations.where(byTrip).sortBy('checkIn'),
      db.transport.where(byTrip).sortBy('at'),
      db.experiences.where(byTrip).toArray(),
      db.restaurants.where(byTrip).toArray(),
      db.itineraryDays.where(byTrip).sortBy('date'),
      db.itineraryItems.where(byTrip).sortBy('time'),
      db.expenses.where(byTrip).toArray(),
      db.documents.where(byTrip).toArray(),
      db.memories.get(tripId),
      db.journeySteps.where(byTrip).sortBy('at'),
      db.journeyProgress.where(byTrip).toArray(),
      db.pickups.get(tripId),
      db.flightStatus.where(byTrip).toArray(),
    ]);
  return {
    trip,
    flights,
    bookings,
    accommodations,
    transport,
    experiences,
    restaurants,
    days,
    items,
    expenses,
    documents,
    memory: memory ?? null,
    steps,
    doneStepIds: new Set(progress.map((p) => p.stepId)),
    pickup: pickup ?? null,
    statuses,
  };
}

export type TripBundle = NonNullable<Awaited<ReturnType<typeof getTripBundle>>>;

/** The cascade for whatever disruption is currently recorded on the trip (or none). */
export function currentCascade(b: TripBundle) {
  const event = eventFromStatuses(b.statuses);
  return { event, result: runCascade(b, event) };
}

/** The next upcoming flight leg, its onward connection and the connection risk. */
export async function getNextFlight() {
  const upcoming = (await db.trips.where('status').equals('upcoming').toArray()).sort((a, b) => a.startDate.localeCompare(b.startDate));
  // The first upcoming trip that has a flight (a just-created trip may not have one yet).
  let bundle: TripBundle | null = null;
  for (const t of upcoming) {
    const b = await getTripBundle(t.id);
    if (b?.flights.length) {
      bundle = b;
      break;
    }
  }
  if (!bundle) return null;
  const trip = bundle.trip;

  const [leg, onward] = bundle.flights;
  const { event, result } = currentCascade(bundle);
  const status = bundle.statuses.find((s) => s.flightId === leg.id);
  const risk: RiskLevel = result.brokenAt ? 'bad' : onward ? (result.effects.find((e) => e.id === `conn-${onward.id}`)?.level ?? 'ok') : 'ok';

  return {
    trip,
    leg,
    onward: onward ?? null,
    layover: onward ? minutesBetween(leg.arrive, onward.depart) : null,
    event,
    headline: result.headline,
    risk,
    status: status ?? null,
    leaveHomeAt: adjustedSteps(bundle.steps, bundle.flights, event)[0]?.at ?? null,
  };
}
