import { useLiveQuery } from 'dexie-react-hooks';
import { listBookings } from '../db/repos/bookings';
import { loyaltySummary } from '../engines/loyalty';

/** Live loyalty points: updates the moment a booking is confirmed. */
export function usePoints() {
  return useLiveQuery(async () => loyaltySummary(await listBookings()));
}
