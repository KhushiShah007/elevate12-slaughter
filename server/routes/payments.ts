import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, jsonBody, parse } from '../http';
import { requireUser } from '../auth';
import { hmacHex, MOCK_SECRET, paymentProvider } from '../payments';
import { sendOutbound } from '../outbound';
import { textPdf } from '../pdf';
import { LOYALTY_RATE, MAX_REDEEM_SHARE } from '../../src/engines/loyalty';

// Booking and paying in Voyage (test mode), receipts, and the payment webhook.

export const payments = new Hono<{ Variables: { userId: string } }>();
payments.use('/payments/checkout', requireUser);
payments.use('/payments/verify', requireUser);
payments.use('/payments/demo-pay', requireUser);
payments.use('/bookings', requireUser);
payments.use('/bookings/*', requireUser);

/** Points the traveller can spend: 3% of in-app spend, minus points already used. */
export async function pointsBalance(userId: string) {
  const { db } = await getDb();
  const [server] = await db
    .select({ spend: sql<number>`coalesce(sum(${s.bookings.amountInr}), 0)`, used: sql<number>`coalesce(sum(${s.bookings.pointsUsed}), 0)` })
    .from(s.bookings)
    .where(and(eq(s.bookings.userId, userId), eq(s.bookings.source, 'in_app'), eq(s.bookings.status, 'confirmed')));
  // Bookings confirmed in the app before payments existed (demo recoveries) also earned points.
  const recs = await db.select({ payload: s.userRecords.payload }).from(s.userRecords).where(and(eq(s.userRecords.userId, userId), eq(s.userRecords.tbl, 'bookings'), eq(s.userRecords.deleted, false)));
  const deviceSpend = recs
    .map((r) => r.payload as { bookedViaApp?: boolean; status?: string; amount?: number; sample?: boolean; serverBookingId?: string })
    .filter((b) => b.bookedViaApp && b.status === 'confirmed' && !b.sample && !b.serverBookingId)
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);
  return Math.max(0, Math.floor((Number(server.spend) + deviceSpend) * LOYALTY_RATE) - Number(server.used));
}

const policy = z.record(z.string(), z.unknown()).nullable().optional();
const checkoutBody = z.object({
  idempotencyKey: z.string().min(8).max(100),
  pointsToUse: z.number().int().min(0).default(0),
  booking: z.object({
    clientId: z.string().min(1).max(100),
    tripId: z.string().max(100).nullable().optional(),
    kind: z.enum(['flight', 'hotel', 'experience', 'transport']),
    title: z.string().trim().min(1).max(160),
    amountInr: z.number().int().min(1).max(10_000_000),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    pnr: z.string().max(40).nullable().optional(),
    provider: z.string().max(60).nullable().optional(),
    details: z.record(z.string(), z.unknown()).nullable().optional(),
    cancellationPolicy: policy,
  }),
});

payments.post('/payments/checkout', async (c) => {
  const body = await jsonBody(c, checkoutBody);
  const userId = c.get('userId');
  const { db } = await getDb();

  // The same click twice gives the same order.
  const [again] = await db.select().from(s.payments).where(eq(s.payments.idempotencyKey, body.idempotencyKey)).limit(1);
  const provider = paymentProvider();
  if (again) {
    if (again.userId !== userId) throw new AppError(409, 'key_taken', 'Try again.');
    return c.json({ provider: again.provider, publicKey: provider.publicKey, orderId: again.providerOrderId, amountInr: again.amountInr, bookingId: again.bookingId, paymentId: again.id });
  }

  const cap = Math.floor(body.booking.amountInr * MAX_REDEEM_SHARE);
  const balance = await pointsBalance(userId);
  if (body.pointsToUse > Math.min(cap, balance)) throw new AppError(400, 'invalid_input', `You can use up to ${Math.min(cap, balance)} points on this booking.`, { pointsToUse: 'Too many points.' });
  const payable = body.booking.amountInr - body.pointsToUse;

  const [trip] = body.booking.tripId ? await db.select({ id: s.trips.id }).from(s.trips).where(and(eq(s.trips.id, body.booking.tripId), eq(s.trips.userId, userId))).limit(1) : [];
  const [booking] = await db
    .insert(s.bookings)
    .values({
      userId,
      tripId: trip?.id ?? null,
      clientId: body.booking.clientId,
      kind: body.booking.kind,
      title: body.booking.title,
      status: 'pending',
      amountInr: body.booking.amountInr,
      provider: body.booking.provider ?? null,
      pnr: body.booking.pnr ?? null,
      source: 'in_app',
      startsAt: body.booking.startsAt ? new Date(body.booking.startsAt) : null,
      details: body.booking.details ?? null,
      cancellationPolicy: body.booking.cancellationPolicy ?? null,
      pointsUsed: body.pointsToUse,
    })
    .onConflictDoUpdate({ target: s.bookings.clientId, set: { amountInr: body.booking.amountInr, pointsUsed: body.pointsToUse } })
    .returning();
  if (booking.userId !== userId) throw new AppError(409, 'id_taken', 'That booking belongs to someone else.');

  const order = await provider.createOrder(payable * 100, booking.id);
  const [payment] = await db
    .insert(s.payments)
    .values({ userId, bookingId: booking.id, provider: provider.name, providerOrderId: order.orderId, amountInr: payable, idempotencyKey: body.idempotencyKey })
    .returning();
  await db.update(s.bookings).set({ paymentId: payment.id, paymentStatus: 'created' }).where(eq(s.bookings.id, booking.id));
  await db.insert(s.paymentEvents).values({ paymentId: payment.id, type: 'order.created', payload: { orderId: order.orderId, amountInr: payable } });
  return c.json({ provider: provider.name, publicKey: provider.publicKey, orderId: order.orderId, amountInr: payable, bookingId: booking.id, paymentId: payment.id });
});

/** Mark an order paid (after its signature checked out): booking confirmed, receipt emailed. */
async function markPaid(orderId: string, providerPaymentId: string, method: string | null, eventId: string | null) {
  const { db } = await getDb();
  const [p] = await db.select().from(s.payments).where(eq(s.payments.providerOrderId, orderId)).limit(1);
  if (!p) throw new AppError(404, 'not_found', 'Unknown order.');
  if (eventId) {
    const inserted = await db.insert(s.paymentEvents).values({ paymentId: p.id, providerEventId: eventId, type: 'payment.captured', payload: { providerPaymentId } }).onConflictDoNothing().returning();
    if (!inserted.length) return p; // webhook retried: already handled
  }
  if (p.status === 'paid') return p;
  await db.update(s.payments).set({ status: 'paid', providerPaymentId, method, updatedAt: new Date() }).where(eq(s.payments.id, p.id));
  if (p.bookingId) {
    const [b] = await db.update(s.bookings).set({ status: 'confirmed', paymentStatus: 'paid', providerRef: providerPaymentId }).where(eq(s.bookings.id, p.bookingId)).returning();
    const [u] = await db.select({ email: s.users.email, name: s.profiles.name }).from(s.users).leftJoin(s.profiles, eq(s.profiles.userId, s.users.id)).where(eq(s.users.id, p.userId)).limit(1);
    if (u?.email) {
      await sendOutbound({
        userId: p.userId,
        channel: 'email',
        to: u.email,
        subject: `Booking confirmed: ${b.title}`,
        body: `Hi ${u.name ?? 'there'},\n\nYour booking "${b.title}" is confirmed.\nPaid: Rs ${p.amountInr}${b.pointsUsed ? ` (+ ${b.pointsUsed} points)` : ''}\nPayment reference: ${providerPaymentId}\n\nYour receipt is in the app under the trip's bookings.\n\nVoyage`,
        relatedType: 'booking',
        relatedId: b.id,
      });
    }
  }
  return p;
}

payments.post('/payments/verify', async (c) => {
  const body = await jsonBody(c, z.object({ orderId: z.string().max(80), paymentId: z.string().max(80), signature: z.string().max(200), method: z.string().max(30).optional() }));
  const { db } = await getDb();
  const [p] = await db.select().from(s.payments).where(and(eq(s.payments.providerOrderId, body.orderId), eq(s.payments.userId, c.get('userId')))).limit(1);
  if (!p) throw new AppError(404, 'not_found', 'Unknown order.');
  if (!paymentProvider().verifyPayment(body.orderId, body.paymentId, body.signature)) {
    await db.insert(s.paymentEvents).values({ paymentId: p.id, type: 'signature.invalid', payload: { paymentId: body.paymentId } });
    throw new AppError(400, 'bad_signature', 'Payment could not be verified. You were not charged by Voyage.');
  }
  await markPaid(body.orderId, body.paymentId, body.method ?? null, null);
  const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, p.bookingId!)).limit(1);
  return c.json({ booking: b });
});

/** Demo checkout: stands in for Razorpay's widget. Signs like Razorpay so the same checks run. */
payments.post('/payments/demo-pay', async (c) => {
  if (paymentProvider().name !== 'mock') throw new AppError(400, 'not_demo', 'Demo payments are off: Razorpay is configured.');
  const body = await jsonBody(c, z.object({ orderId: z.string().max(80), outcome: z.enum(['success', 'failure']), method: z.enum(['card', 'upi', 'netbanking']).default('upi') }));
  const { db } = await getDb();
  const [p] = await db.select().from(s.payments).where(and(eq(s.payments.providerOrderId, body.orderId), eq(s.payments.userId, c.get('userId')))).limit(1);
  if (!p) throw new AppError(404, 'not_found', 'Unknown order.');
  if (body.outcome === 'failure') {
    await db.update(s.payments).set({ status: 'failed', updatedAt: new Date() }).where(eq(s.payments.id, p.id));
    await db.insert(s.paymentEvents).values({ paymentId: p.id, type: 'payment.failed', payload: { reason: 'demo decline' } });
    return c.json({ ok: false, message: 'Payment declined (demo). Nothing was charged.' });
  }
  const paymentId = `pay_demo_${randomBytes(7).toString('hex')}`;
  return c.json({ ok: true, orderId: p.providerOrderId, paymentId, signature: hmacHex(MOCK_SECRET, `${p.providerOrderId}|${paymentId}`), method: body.method });
});

/** Razorpay webhook (and the demo equivalent): signature checked on the raw body; each event once. */
payments.post('/payments/webhook', async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header('x-razorpay-signature') ?? '';
  if (!paymentProvider().verifyWebhook(raw, signature)) throw new AppError(401, 'bad_signature', 'Invalid signature.');
  const eventId = c.req.header('x-razorpay-event-id') ?? null;
  const evt = JSON.parse(raw) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string; method?: string } }; refund?: { entity?: { id: string; payment_id: string; amount: number; status: string } } } };
  const { db } = await getDb();
  if (evt.event === 'payment.captured' && evt.payload?.payment?.entity) {
    const e = evt.payload.payment.entity;
    await markPaid(e.order_id, e.id, e.method ?? null, eventId);
  } else if ((evt.event === 'refund.processed' || evt.event === 'refund.failed') && evt.payload?.refund?.entity) {
    const r = evt.payload.refund.entity;
    const [req] = await db.select().from(s.cancellationRequests).where(eq(s.cancellationRequests.providerRef, r.id)).limit(1);
    if (eventId) {
      const fresh = await db.insert(s.paymentEvents).values({ providerEventId: eventId, type: evt.event, payload: r }).onConflictDoNothing().returning();
      if (!fresh.length) return c.json({ ok: true, duplicate: true });
    }
    if (req) {
      const { applyRefundResult } = await import('./cancellations');
      await applyRefundResult(req.id, evt.event === 'refund.processed' ? 'processed' : 'failed', Math.round(r.amount / 100));
    }
  }
  return c.json({ ok: true });
});

payments.get('/bookings', async (c) => {
  const { db } = await getDb();
  const rows = await db.select().from(s.bookings).where(eq(s.bookings.userId, c.get('userId')));
  return c.json({ bookings: rows });
});

payments.get('/bookings/:id/receipt', async (c) => {
  const id = parse(z.string().uuid(), c.req.param('id'));
  const { db } = await getDb();
  const [b] = await db.select().from(s.bookings).where(and(eq(s.bookings.id, id), eq(s.bookings.userId, c.get('userId')))).limit(1);
  if (!b || b.status === 'pending') throw new AppError(404, 'not_found', 'No receipt for that booking.');
  const [p] = b.paymentId ? await db.select().from(s.payments).where(eq(s.payments.id, b.paymentId)).limit(1) : [];
  const pdf = textPdf([
    { text: 'Voyage - Receipt', size: 20, bold: true },
    { text: p?.provider === 'mock' ? 'TEST MODE (demo payment, no money moved)' : 'Razorpay test mode', size: 10, gap: 4 },
    { text: `Booking: ${b.title ?? ''}`, gap: 18, bold: true },
    { text: `Booking ID: ${b.id}` },
    { text: `Type: ${b.kind ?? ''}` },
    { text: `Status: ${b.status}` },
    { text: `Date: ${b.createdAt.toISOString().slice(0, 10)}` },
    { text: `Price: Rs ${b.amountInr}`, gap: 12 },
    { text: `Points used: ${b.pointsUsed} (Rs ${b.pointsUsed})` },
    { text: `Paid: Rs ${p?.amountInr ?? b.amountInr - b.pointsUsed}`, bold: true },
    { text: `Payment ref: ${p?.providerPaymentId ?? '-'}` },
    ...(b.refundedInr ? [{ text: `Refunded: Rs ${b.refundedInr}`, bold: true }] : []),
    { text: 'Thank you for travelling with Voyage.', gap: 24, size: 10 },
  ]);
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="receipt-${b.id.slice(0, 8)}.pdf"`, 'cache-control': 'private, no-store' } });
});

payments.get('/payments/points', requireUser, async (c) => c.json({ balance: await pointsBalance(c.get('userId')) }));
