import { db } from '../db';
import { writeAndQueue } from '../syncQueue';
import type { Booking } from '../../types';

export const listBookings = () => db.bookings.toArray();

/** The recovery already chosen for a disruption, if any. */
export async function getChosenRecovery(tripId: string, recoveryFor: string) {
  return (await db.bookings.where({ tripId }).filter((b) => b.recoveryFor === recoveryFor).first()) ?? null;
}

/**
 * The traveller confirmed a recovery option. In the prototype there is no provider,
 * so the booking is recorded as simulated and labelled that way everywhere.
 */
export async function confirmRecovery(tripId: string, title: string, newSpend: number, recoveryFor: string) {
  const booking: Booking = {
    id: `rec-${crypto.randomUUID()}`,
    tripId,
    kind: 'flight',
    title,
    amount: newSpend, // only new money paid; lost prepaid value isn't a booking
    status: 'confirmed',
    bookedViaApp: true,
    simulated: true,
    recoveryFor,
  };
  await writeAndQueue('bookings', booking.id, booking, `Recovery chosen: ${title}`);
  return booking;
}
