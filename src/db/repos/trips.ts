import { db } from '../db';
import { adjustedSteps, eventFromStatuses, runCascade } from '../../engines/cascade';
import { minutesBetween } from '../../engines/time';
import type { RiskLevel } from '../../types';

export const listTrips = () => db.trips.toArray();

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
  const trip = upcoming[0];
  if (!trip) return null;
  const bundle = await getTripBundle(trip.id);
  if (!bundle?.flights.length) return null;

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
