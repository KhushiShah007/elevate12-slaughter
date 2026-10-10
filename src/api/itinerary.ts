import { api } from './client';
import type { Plan } from '../engines/planner';

// Client side of the living itinerary.

export interface ItineraryView {
  itinerary: { tripId: string; version: number; plan: Plan; updatedAt: string } | null;
  versions?: { version: number; reason: string; changes: string[]; createdAt: string }[];
}
export interface AdaptView extends ItineraryView {
  changed: boolean;
  changes?: string[];
  warnings: { itemId: string; title: string; bookingId: string; message: string }[];
  emergency?: { country: string; numbers: { all?: string; police?: string; ambulance?: string }; pharmacy: string; hospital: string } | null;
}

export const getItinerary = (tripId: string) => api<ItineraryView>('GET', `/itineraries/${tripId}`);
export const generateItinerary = (tripId: string) => api<ItineraryView>('POST', `/itineraries/${tripId}/generate`, undefined, 40_000);
export const adaptItinerary = (tripId: string, body: { mode: string; date: string; baseVersion: number; itemId?: string; minutes?: number; placeId?: string }) =>
  api<AdaptView>('POST', `/itineraries/${tripId}/adapt`, body, 40_000);
export const undoItinerary = (tripId: string, baseVersion: number) => api<ItineraryView>('POST', `/itineraries/${tripId}/undo`, { baseVersion });
export const lockItem = (tripId: string, itemId: string, locked: boolean, baseVersion: number) => api<ItineraryView>('POST', `/itineraries/${tripId}/lock`, { itemId, locked, baseVersion });

/** One tap from Experiences/Restaurants: add a guide place to the best day of the trip. */
export async function addToItinerary(tripId: string, placeId: string, date?: string) {
  let v = await getItinerary(tripId);
  if (!v.itinerary) v = await generateItinerary(tripId);
  const plan = v.itinerary!.plan;
  const today = new Date().toISOString().slice(0, 10);
  const day = date ?? plan.days.find((d) => d.date === today)?.date ?? plan.days.find((d) => d.kind === 'full')?.date ?? plan.days[0].date;
  return adaptItinerary(tripId, { mode: 'add', date: day, placeId, baseVersion: v.itinerary!.version });
}
