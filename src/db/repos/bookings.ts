import { db } from '../db';
import { writeAndQueue } from '../syncQueue';
import type { Booking, RecoveryOption } from '../../types';

export const listBookings = () => db.bookings.toArray();

/**
 * The traveller confirmed a recovery option. In the prototype there is no provider,
 * so the booking is recorded as simulated and labelled that way everywhere.
 */
export async function confirmRecovery(tripId: string, option: RecoveryOption) {
  const booking: Booking = {
    id: `rec-${crypto.randomUUID()}`,
    tripId,
    kind: 'flight',
    title: option.title,
    amount: option.trueCost,
    status: 'confirmed',
    bookedViaApp: true,
    simulated: true,
  };
  await writeAndQueue('bookings', booking.id, booking, `Recovery chosen: ${option.title}`);
  return booking;
}
