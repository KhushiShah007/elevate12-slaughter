import { db } from '../db';
import { connectionRisk, minutesBetween } from '../../engines/connectionRisk';

export const listTrips = () => db.trips.toArray();

/** Everything one trip owns. Data is always looked up by tripId, never shared. */
export async function getTripBundle(tripId: string) {
  const trip = await db.trips.get(tripId);
  if (!trip) return null;
  const byTrip = { tripId };
  const [flights, bookings, accommodations, transport, experiences, restaurants, days, items, expenses, documents, memory, steps, progress, pickup] =
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
  };
}

export type TripBundle = NonNullable<Awaited<ReturnType<typeof getTripBundle>>>;

/** The next upcoming flight leg, its onward connection and the connection risk. */
export async function getNextFlight() {
  const upcoming = (await db.trips.where('status').equals('upcoming').toArray()).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const trip = upcoming[0];
  if (!trip) return null;
  const legs = await db.flights.where({ tripId: trip.id }).sortBy('depart');
  const [leg, onward] = legs;
  if (!leg) return null;
  const status = await db.flightStatus.get(leg.id);
  const delay = status?.delayMin ?? 0;
  const layover = onward ? minutesBetween(leg.arrive, onward.depart) : null;
  const firstStep = (await db.journeySteps.where({ tripId: trip.id }).sortBy('at'))[0];
  return {
    trip,
    leg,
    onward: onward ?? null,
    layover,
    delay,
    risk: layover === null ? ('ok' as const) : connectionRisk(layover, delay),
    lastSynced: status?.lastSynced ?? null,
    leaveHomeAt: firstStep?.at ?? null,
    pickup: (await db.pickups.get(trip.id)) ?? null,
  };
}
