import { useMemo } from 'react';
import { bookings } from '../data/sampleTrips';
import { loyaltySummary } from '../engines/loyalty';

// Goal 1 reads bundled sample bookings. Goal 2 swaps this for a live Dexie query,
// so the pill updates the moment a booking is confirmed.
export function usePoints() {
  return useMemo(() => loyaltySummary(bookings), []);
}
