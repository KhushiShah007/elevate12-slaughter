import type { Booking, LoyaltyEntry } from '../types';

export const LOYALTY_RATE = 0.03; // 3% of spend through the app

/** Only confirmed bookings made through the app earn points. */
export function earnsPoints(b: Booking): boolean {
  return b.bookedViaApp && b.status === 'confirmed' && b.amount > 0;
}

/** Points for one amount, rounded down to whole points. */
export function pointsFor(amount: number): number {
  return Math.floor(amount * LOYALTY_RATE + 1e-9);
}

export function loyaltyEntries(bookings: Booking[]): LoyaltyEntry[] {
  return bookings.filter(earnsPoints).map((b) => ({
    bookingId: b.id,
    tripId: b.tripId,
    title: b.title,
    amount: b.amount,
    points: pointsFor(b.amount),
    simulated: b.simulated ?? false,
  }));
}

/** Total is 3% of the total spend, so rounding happens once, not per booking. */
export function loyaltySummary(bookings: Booking[]) {
  const entries = loyaltyEntries(bookings);
  const spend = entries.reduce((sum, e) => sum + e.amount, 0);
  return { entries, spend, total: pointsFor(spend) };
}
