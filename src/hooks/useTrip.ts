import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getNextFlight, getTripBundle } from '../db/repos/trips';
import { getCurrentUser, getPreferences } from '../db/repos/users';
import type { Trip } from '../types';

// Live views over the on-device database. Each returns `undefined` while loading
// (a few milliseconds), and re-renders on its own whenever the data changes.

export function useTrips() {
  return useLiveQuery(async () => {
    const all = await db.trips.toArray();
    // The traveller's own trips first, then the bundled sample trips (labelled).
    const byStart = (a: Trip, b: Trip) => Number(Boolean(a.sample)) - Number(Boolean(b.sample)) || a.startDate.localeCompare(b.startDate);
    return {
      existing: all.filter((t) => t.status !== 'completed').sort(byStart),
      completed: all.filter((t) => t.status === 'completed').sort((a, b) => Number(Boolean(a.sample)) - Number(Boolean(b.sample)) || b.startDate.localeCompare(a.startDate)),
    };
  });
}

/** One trip and everything it owns, or null if it does not exist. */
export function useTrip(tripId: string | undefined) {
  return useLiveQuery(() => (tripId ? getTripBundle(tripId) : null), [tripId]);
}

export function useNextFlight() {
  return useLiveQuery(getNextFlight);
}

export function useMemories() {
  return useLiveQuery(() => db.memories.toArray());
}

export function useTraveller() {
  return useLiveQuery(async () => {
    const user = await getCurrentUser();
    return { name: user?.name ?? 'Traveller', contact: user?.phoneOrEmail ?? '' };
  });
}

export function usePreferences() {
  return useLiveQuery(getPreferences);
}
