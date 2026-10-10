import { useMemo } from 'react';
import * as sample from '../data/sampleTrips';
import { documents } from '../data/sampleDocuments';
import { connectionRisk, minutesBetween } from '../engines/connectionRisk';

// Goal 1: selectors over bundled sample data. Goal 2 moves these to src/db (Dexie)
// with the same shapes, so screens do not change.

const byTrip = <T extends { tripId: string | null }>(rows: T[], tripId: string) =>
  rows.filter((r) => r.tripId === tripId);

export function useTrips() {
  return {
    existing: sample.trips.filter((t) => t.status !== 'completed'),
    completed: sample.trips.filter((t) => t.status === 'completed'),
  };
}

export function useTrip(tripId: string | undefined) {
  return useMemo(() => {
    const trip = sample.trips.find((t) => t.id === tripId);
    if (!trip) return null;
    const id = trip.id;
    return {
      trip,
      flights: byTrip(sample.flights, id),
      bookings: byTrip(sample.bookings, id),
      accommodations: byTrip(sample.accommodations, id),
      transport: byTrip(sample.transport, id),
      experiences: byTrip(sample.experiences, id),
      restaurants: byTrip(sample.restaurants, id),
      days: byTrip(sample.itineraryDays, id),
      items: byTrip(sample.itineraryItems, id),
      expenses: byTrip(sample.expenses, id),
      documents: byTrip(documents, id),
      memory: sample.completedMemories.find((m) => m.tripId === id) ?? null,
    };
  }, [tripId]);
}

/** The next flight leg and the risk on its onward connection. */
export function useNextFlight() {
  return useMemo(() => {
    const next = sample.trips.find((t) => t.status === 'upcoming')!;
    const legs = byTrip(sample.flights, next.id);
    const [leg, onward] = legs;
    const delay = sample.flightStatus.flightId === leg.id ? sample.flightStatus.delayMin : 0;
    const layover = onward ? minutesBetween(leg.arrive, onward.depart) : null;
    const risk = layover === null ? 'ok' : connectionRisk(layover, delay);
    return { trip: next, leg, onward, layover, delay, risk, lastSynced: sample.flightStatus.lastSynced } as const;
  }, []);
}

export const sampleUser = sample.sampleUser;
export const journeySteps = sample.journeySteps;
export const completedMemories = sample.completedMemories;
export const familyPickup = sample.familyPickup;
