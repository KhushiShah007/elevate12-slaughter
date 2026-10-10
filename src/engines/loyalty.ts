import type { Booking, LoyaltyEntry } from '../types';

export const LOYALTY_RATE = 0.03; // 3% of spend through the app

/** Only confirmed bookings the traveller made through the app earn points (not the demo trip's). */
export function earnsPoints(b: Booking): boolean {
  return b.bookedViaApp && b.status === 'confirmed' && b.amount > 0 && !b.sample;
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
  // Points already spent on bookings come off the balance.
  const used = bookings.reduce((sum, b) => sum + (b.pointsUsed ?? 0), 0);
  return { entries, spend, used, total: Math.max(0, pointsFor(spend) - used) };
}

// ---------- Using points ----------

/** 1 point is worth ₹1 off. Points can pay for up to 20% of a booking. */
export const POINT_VALUE_INR = 1;
export const MAX_REDEEM_SHARE = 0.2;

/** How many points a booking can use, what that saves, and what is left to pay. */
export function redeemFor(balance: number, amount: number) {
  if (amount <= 0 || balance <= 0) return { points: 0, savesInr: 0, payInr: Math.max(0, amount) };
  const points = Math.min(balance, Math.floor((amount * MAX_REDEEM_SHARE) / POINT_VALUE_INR));
  return { points, savesInr: points * POINT_VALUE_INR, payInr: amount - points * POINT_VALUE_INR };
}
