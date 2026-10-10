import { db } from '../db';
import { writeAndQueue } from '../syncQueue';
import type { Booking } from '../../types';

export const listBookings = () => db.bookings.toArray();

/**
 * The traveller confirmed a recovery option. In the prototype there is no provider,
 * so the booking is recorded as simulated and labelled that way everywhere.
 */
export async function confirmRecovery(tripId: string, title: string, newSpend: number) {
  const booking: Booking = {
    id: `rec-${crypto.randomUUID()}`,
    tripId,
    kind: 'flight',
    title,
    amount: newSpend, // only new money paid; lost prepaid value isn't a booking
    status: 'confirmed',
    bookedViaApp: true,
    simulated: true,
  };
  await writeAndQueue('bookings', booking.id, booking, `Recovery chosen: ${title}`);
  return booking;
}
