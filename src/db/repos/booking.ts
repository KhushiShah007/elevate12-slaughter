import { db } from '../db';
import { writeAndQueue } from '../syncQueue';
import { api } from '../../api/client';
import type { Booking, Trip } from '../../types';

// Booking things in Voyage (test mode) and keeping the phone's copy in step.

/** A cancellation policy for an option that has none from a provider (labelled an estimate). */
export function policyFor(b: Booking, trip: Trip): Record<string, unknown> {
  const start = b.startsAt ?? `${trip.startDate.slice(0, 10)}T06:00:00+05:30`;
  if (b.kind === 'flight') {
    const conv = Math.round(b.amount * 0.04);
    const taxes = Math.round(b.amount * 0.18);
    return { kind: 'flight', refundable: true, baseFareInr: b.amount - conv - taxes, taxesInr: taxes, convenienceFeeInr: conv, departAt: start, bookedAt: new Date().toISOString(), bookedDirect: false, domestic: true };
  }
  if (b.kind === 'hotel') {
    const nights = Math.max(1, Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000));
    return { kind: 'hotel', totalInr: b.amount, nights, freeCancelUntil: new Date(Date.parse(start) - 48 * 3_600_000).toISOString(), penaltyNights: 1, nonRefundable: false };
  }
  return { kind: b.kind === 'experience' ? 'experience' : 'transport', totalInr: b.amount, startsAt: start, freeCancelHours: 24, nonRefundable: false };
}

export interface Checkout {
  provider: 'razorpay' | 'mock';
  publicKey: string | null;
  orderId: string;
  amountInr: number;
  bookingId: string;
}

export async function startCheckout(b: Booking, trip: Trip, pointsToUse: number) {
  const policy = b.policy ?? policyFor(b, trip);
  return api<Checkout>('POST', '/payments/checkout', {
    idempotencyKey: `${b.id}-${pointsToUse}`,
    pointsToUse,
    booking: {
      clientId: b.id,
      tripId: trip.sample ? null : trip.id,
      kind: b.kind,
      title: b.title,
      amountInr: b.amount,
      startsAt: (policy.departAt as string) ?? (policy.startsAt as string) ?? null,
      provider: b.provider ?? b.details?.provider ?? null,
      details: b.details ?? null,
      cancellationPolicy: policy,
    },
  });
}

/** Paid and verified: the option becomes a confirmed in-app booking on the phone. */
export async function markBooked(b: Booking, serverBookingId: string, pointsUsed: number) {
  const next: Booking = { ...b, status: 'confirmed', bookedViaApp: true, serverBookingId, pointsUsed, policy: b.policy, simulated: false };
  await writeAndQueue('bookings', b.id, next, `Booked: ${b.title}`);
  return next;
}

/** Cancelled: mark it on the phone with the refund (budget and itinerary update from this). */
export async function markCancelled(bookingId: string, refundInr: number, cancellationId: string) {
  const b = await db.bookings.get(bookingId);
  if (!b) return;
  await writeAndQueue('bookings', b.id, { ...b, status: 'cancelled', refundInr, cancellationId }, `Cancelled: ${b.title}`);
}

let razorpayLoad: Promise<void> | null = null;
/** Razorpay's checkout script, loaded only when Razorpay is configured. */
export function loadRazorpay() {
  razorpayLoad ??= new Promise<void>((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
    sc.onload = () => resolve();
    sc.onerror = () => {
      razorpayLoad = null;
      reject(new Error('Could not load Razorpay'));
    };
    document.head.appendChild(sc);
  });
  return razorpayLoad;
}
