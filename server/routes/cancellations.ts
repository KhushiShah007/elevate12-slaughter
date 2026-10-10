import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, jsonBody, parse } from '../http';
import { requireUser } from '../auth';
import { paymentProvider } from '../payments';
import { sendOutbound } from '../outbound';
import { complete, llmProvider } from '../ai/llm';
import rulesJson from '../config/refund-rules.json';
import {
  ESCALATION_LADDER,
  estimateRefund,
  followUpDue,
  transition,
  type CancelState,
  type CancellationPolicy,
  type PayMethod,
  type RefundRules,
} from '../../src/engines/refund';

// Cancellation and refund center. Nothing is cancelled, refunded or emailed without the
// traveller's explicit tap; every step is a recorded, idempotent state change.

export const cancellations = new Hono<{ Variables: { userId: string } }>();
cancellations.use('/cancellations', requireUser);
cancellations.use('/cancellations/*', requireUser);
cancellations.use('/providers/*', requireUser);

const rules = rulesJson as unknown as RefundRules;

/** A booking as the cancellation sees it (in-app bookings come from the DB; others from the phone). */
const snapshot = z.object({
  clientId: z.string().min(1).max(100),
  kind: z.enum(['flight', 'hotel', 'experience', 'transport']),
  title: z.string().trim().min(1).max(160),
  amountInr: z.number().int().min(0).max(10_000_000),
  provider: z.string().max(80).nullable().optional(),
  pnr: z.string().max(40).nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  bookedAt: z.string().nullable().optional(),
  paymentMethod: z.enum(['card', 'upi', 'netbanking', 'cash', 'agent', 'creditShell']).default('card'),
  policy: z.record(z.string(), z.unknown()).nullable().optional(),
});
type Snapshot = z.infer<typeof snapshot> & { source: 'in_app' | 'external'; serverBookingId?: string; travellerName?: string };

/** A sensible policy when the booking did not carry one (labelled as an estimate). */
export function defaultPolicy(b: Snapshot, now: Date): CancellationPolicy {
  const starts = b.startsAt ?? new Date(now.getTime() + 14 * 86_400_000).toISOString();
  if (b.kind === 'flight') {
    const conv = Math.round(b.amountInr * 0.04);
    const taxes = Math.round(b.amountInr * 0.18);
    return { kind: 'flight', refundable: true, baseFareInr: b.amountInr - conv - taxes, taxesInr: taxes, convenienceFeeInr: conv, departAt: starts, bookedAt: b.bookedAt ?? new Date(now.getTime() - 30 * 86_400_000).toISOString(), bookedDirect: b.source === 'in_app', domestic: true };
  }
  if (b.kind === 'hotel') {
    const nights = b.endsAt ? Math.max(1, Math.round((Date.parse(b.endsAt) - Date.parse(starts)) / 86_400_000)) : 2;
    return { kind: 'hotel', totalInr: b.amountInr, nights, freeCancelUntil: new Date(Date.parse(starts) - 48 * 3_600_000).toISOString(), penaltyNights: 1, nonRefundable: false };
  }
  return { kind: b.kind, totalInr: b.amountInr, startsAt: starts, freeCancelHours: 24, nonRefundable: false };
}

async function record(requestId: string, type: string, actor: 'user' | 'system' | 'provider', note: string | null, extra: { from?: string; to?: string; data?: unknown } = {}) {
  const { db } = await getDb();
  await db.insert(s.refundEvents).values({ requestId, type, actor, note, fromStatus: extra.from ?? null, toStatus: extra.to ?? null, data: (extra.data as object) ?? null });
}

/** Move a request to a new state (idempotent), with an audit entry. */
async function move(requestId: string, userId: string | null, to: CancelState, actor: 'user' | 'system' | 'provider', note: string | null, patch: Partial<typeof s.cancellationRequests.$inferInsert> = {}) {
  const { db } = await getDb();
  const [r] = await db.select().from(s.cancellationRequests).where(eq(s.cancellationRequests.id, requestId)).limit(1);
  if (!r || (userId && r.userId !== userId)) throw new AppError(404, 'not_found', 'We could not find that cancellation.');
  const t = transition(r.status as CancelState, to);
  if (!t.ok) throw new AppError(409, 'bad_transition', t.error);
  if (!t.changed) return r;
  const [next] = await db
    .update(s.cancellationRequests)
    .set({ ...patch, status: to, version: r.version + 1, statusChangedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.cancellationRequests.id, requestId), eq(s.cancellationRequests.version, r.version)))
    .returning();
  if (!next) throw new AppError(409, 'conflict', 'This cancellation changed at the same time. Reload and try again.');
  await record(requestId, 'status', actor, note, { from: r.status, to });
  return next;
}

/** Called by the payment webhook (or the demo refund) when money comes back. */
export async function applyRefundResult(requestId: string, outcome: 'processed' | 'failed', amountInr: number) {
  const { db } = await getDb();
  const [r] = await db.select().from(s.cancellationRequests).where(eq(s.cancellationRequests.id, requestId)).limit(1);
  if (!r) return;
  if (outcome === 'failed') {
    await record(requestId, 'note', 'provider', 'The refund failed at the payment provider. We will help you follow up.');
    return;
  }
  const expected = (r.booking as Snapshot & { quotedRefund?: number }).quotedRefund ?? amountInr;
  const to: CancelState = amountInr >= expected ? 'refunded' : 'partially_refunded';
  await move(requestId, null, to, 'provider', `Refund of Rs ${amountInr} processed.`, { refundedInr: amountInr });
  if (r.bookingId) await db.update(s.bookings).set({ refundedInr: amountInr, paymentStatus: 'refunded' }).where(eq(s.bookings.id, r.bookingId));
}

// ---------- Quote ----------

cancellations.post('/cancellations/quote', async (c) => {
  const body = await jsonBody(c, z.object({ bookingId: z.string().uuid().optional(), booking: snapshot.optional(), reason: z.string().max(300).optional() }));
  const userId = c.get('userId');
  const { db } = await getDb();
  let snap: Snapshot;
  let bookingId: string | null = null;
  if (body.bookingId) {
    const [b] = await db.select().from(s.bookings).where(and(eq(s.bookings.id, body.bookingId), eq(s.bookings.userId, userId))).limit(1);
    if (!b) throw new AppError(404, 'not_found', 'We could not find that booking.');
    if (b.status === 'cancelled') throw new AppError(409, 'already_cancelled', 'This booking is already cancelled.');
    const [p] = b.paymentId ? await db.select().from(s.payments).where(eq(s.payments.id, b.paymentId)).limit(1) : [];
    bookingId = b.id;
    snap = {
      clientId: b.clientId ?? b.id,
      kind: (b.kind ?? 'flight') as Snapshot['kind'],
      title: b.title ?? 'Booking',
      amountInr: p?.amountInr ?? b.amountInr,
      provider: b.provider,
      pnr: b.pnr,
      startsAt: b.startsAt?.toISOString() ?? null,
      bookedAt: b.createdAt.toISOString(),
      paymentMethod: (p?.method as PayMethod) ?? 'card',
      policy: (b.cancellationPolicy as Record<string, unknown>) ?? null,
      source: 'in_app',
      serverBookingId: b.id,
    };
  } else if (body.booking) {
    snap = { ...body.booking, source: 'external' };
  } else throw new AppError(400, 'invalid_input', 'Choose a booking to cancel.');

  // One open request per booking.
  const open = await db
    .select()
    .from(s.cancellationRequests)
    .where(and(eq(s.cancellationRequests.userId, userId), inArray(s.cancellationRequests.status, ['draft', 'quoted'])));
  const existing = open.find((r) => (r.booking as Snapshot).clientId === snap.clientId);

  const now = new Date();
  const pol = (snap.policy as unknown as CancellationPolicy) ?? defaultPolicy(snap, now);
  const est = estimateRefund(pol, now, rules, snap.paymentMethod);
  const [prof] = await db.select({ name: s.profiles.name }).from(s.profiles).where(eq(s.profiles.userId, userId)).limit(1);
  const stored = { ...snap, policy: pol, policyIsEstimate: !snap.policy, quotedRefund: est.refundInr, travellerName: prof?.name ?? 'Traveller' };

  let request = existing;
  if (!request) {
    [request] = await db.insert(s.cancellationRequests).values({ userId, bookingId, booking: stored, reason: body.reason ?? null, status: 'draft' }).returning();
    await record(request.id, 'status', 'user', 'Cancellation started', { to: 'draft' });
  } else {
    await db.update(s.cancellationRequests).set({ booking: stored, reason: body.reason ?? request.reason }).where(eq(s.cancellationRequests.id, request.id));
  }
  await db.insert(s.refundQuotes).values({ requestId: request.id, refundInr: est.refundInr, feeInr: est.feeInr, components: est.components, method: est.method, days: est.days, source: snap.source === 'in_app' ? paymentProvider().name : 'rules', notes: est.notes });
  request = await move(request.id, userId, 'quoted', 'system', `Estimate: Rs ${est.refundInr} back, fee Rs ${est.feeInr}`, { refundMethod: est.method });
  return c.json({ request, estimate: { ...est, policyIsEstimate: !snap.policy } });
});

// ---------- Confirm (the traveller's tap) ----------

cancellations.post('/cancellations/:id/confirm', async (c) => {
  const id = parse(z.string().uuid(), c.req.param('id'));
  const { autoFollowUp } = await jsonBody(c, z.object({ autoFollowUp: z.boolean().default(false), confirm: z.literal(true) }));
  const userId = c.get('userId');
  const { db } = await getDb();
  const [r] = await db.select().from(s.cancellationRequests).where(and(eq(s.cancellationRequests.id, id), eq(s.cancellationRequests.userId, userId))).limit(1);
  if (!r) throw new AppError(404, 'not_found', 'We could not find that cancellation.');
  if (r.status !== 'quoted' && r.status !== 'user_confirmed') return c.json({ request: r }); // already done (idempotent)
  const [quote] = await db.select().from(s.refundQuotes).where(eq(s.refundQuotes.requestId, id)).orderBy(desc(s.refundQuotes.id)).limit(1);
  const snap = r.booking as Snapshot;
  const expectedBy = new Date(Date.now() + (quote?.days ?? 7) * 86_400_000);
  let next = await move(id, userId, 'user_confirmed', 'user', 'You confirmed the cancellation.', { autoFollowUp, expectedBy });

  if (snap.source === 'in_app' && r.bookingId) {
    // Paid in Voyage: cancel and refund through the payment provider.
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, r.bookingId)).limit(1);
    const [p] = b?.paymentId ? await db.select().from(s.payments).where(eq(s.payments.id, b.paymentId)).limit(1) : [];
    await db.update(s.bookings).set({ status: 'cancelled' }).where(eq(s.bookings.id, r.bookingId));
    const refundInr = Math.min(quote?.refundInr ?? 0, p?.amountInr ?? 0);
    if (p?.providerPaymentId && refundInr > 0) {
      const res = await paymentProvider().refund(p.providerPaymentId, refundInr * 100, { request: id });
      next = await move(id, userId, 'submitted', 'system', `Refund of Rs ${refundInr} requested from ${p.provider === 'mock' ? 'the demo payment provider' : 'Razorpay'}.`, { providerRef: res.refundId });
      await db.update(s.payments).set({ status: refundInr < p.amountInr ? 'partially_refunded' : 'refunded', updatedAt: new Date() }).where(eq(s.payments.id, p.id));
      if (res.status === 'processed') await applyRefundResult(id, 'processed', refundInr);
    } else {
      next = await move(id, userId, 'submitted', 'system', 'Booking cancelled. No money is due back under the policy.');
    }
  }
  const [fresh] = await db.select().from(s.cancellationRequests).where(eq(s.cancellationRequests.id, id)).limit(1);
  return c.json({ request: fresh ?? next });
});

// ---------- Cancellation Assistant: email to the provider ----------

const alias = (requestId: string) => `refunds+${requestId.slice(0, 8)}@${process.env.INBOUND_EMAIL_DOMAIN ?? 'voyage.example'}`;

function templateEmail(snap: Snapshot & { travellerName?: string; quotedRefund?: number }, reason: string | null, kind: 'cancel' | 'followup' | 'escalate') {
  const ref = snap.pnr ? `Booking reference / PNR: ${snap.pnr}` : 'Booking reference: (please add)';
  const when = snap.startsAt ? `Travel date: ${snap.startsAt.slice(0, 10)}` : '';
  const amount = `Amount paid: Rs ${snap.amountInr.toLocaleString('en-IN')} (paid by ${snap.paymentMethod})`;
  const subject =
    kind === 'cancel' ? `Cancellation and refund request – ${snap.pnr ?? snap.title}` : kind === 'followup' ? `Follow-up: refund for ${snap.pnr ?? snap.title}` : `Escalation: refund overdue for ${snap.pnr ?? snap.title}`;
  const opening =
    kind === 'cancel'
      ? `I would like to cancel the booking below and request a refund${snap.quotedRefund ? ` of Rs ${snap.quotedRefund.toLocaleString('en-IN')} as per your cancellation policy` : ''}.`
      : kind === 'followup'
        ? 'I am following up on my cancellation request below. I have not yet received a confirmation or the refund.'
        : 'My refund for the booking below is overdue despite earlier requests. Please process it urgently or share the reason for the delay.';
  const body = [
    'Dear Customer Support,',
    '',
    opening,
    '',
    `Traveller: ${snap.travellerName ?? ''}`,
    `Booking: ${snap.title}`,
    ref,
    when,
    amount,
    reason ? `Reason: ${reason}` : '',
    '',
    'Please refund to the original payment method and confirm the refund reference and expected date.',
    '',
    'Thank you,',
    snap.travellerName ?? '',
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
  return { subject, body };
}

cancellations.post('/cancellations/:id/email/draft', async (c) => {
  const id = parse(z.string().uuid(), c.req.param('id'));
  const { kind } = await jsonBody(c, z.object({ kind: z.enum(['cancel', 'followup', 'escalate']).default('cancel') }));
  const userId = c.get('userId');
  const { db } = await getDb();
  const [r] = await db.select().from(s.cancellationRequests).where(and(eq(s.cancellationRequests.id, id), eq(s.cancellationRequests.userId, userId))).limit(1);
  if (!r) throw new AppError(404, 'not_found', 'We could not find that cancellation.');
  const snap = r.booking as Snapshot & { travellerName?: string; quotedRefund?: number };
  let draft = templateEmail(snap, r.reason, kind);
  let by: 'template' | 'ai' = 'template';
  const p = llmProvider();
  if (p) {
    try {
      // The AI only polishes wording; the reference and amounts must survive unchanged.
      const out = await complete(
        p,
        [
          { role: 'system', content: 'Rewrite this customer email to be polite, clear and firm. Keep every reference, date and amount exactly. Return JSON {"subject":"...","body":"..."}.' },
          { role: 'user', content: JSON.stringify(draft) },
        ],
        { json: true, maxTokens: 600, temperature: 0.2 },
      );
      const j = JSON.parse(out.message.content ?? '{}') as { subject?: string; body?: string };
      const keeps = (t: string) => [snap.pnr, String(snap.amountInr.toLocaleString('en-IN'))].filter(Boolean).every((v) => t.includes(v!));
      if (j.subject && j.body && keeps(j.body)) {
        draft = { subject: j.subject, body: j.body };
        by = 'ai';
      }
    } catch {
      /* template is fine */
    }
  }
  const [contact] = snap.provider ? await db.select().from(s.providerContacts).where(eq(s.providerContacts.provider, snap.provider.toLowerCase())).limit(1) : [];
  const [u] = await db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, userId)).limit(1);
  return c.json({
    ...draft,
    by,
    to: contact?.verified ? contact.email : null,
    supportUrl: contact?.supportUrl ?? null,
    replyTo: u?.email ?? null,
    cc: u?.email ?? null,
    alias: alias(id),
    note: contact?.verified ? null : 'We only use support emails verified on the provider’s own website. Enter the address from their support page.',
  });
});

cancellations.post('/cancellations/:id/email/send', async (c) => {
  const id = parse(z.string().uuid(), c.req.param('id'));
  const body = await jsonBody(
    c,
    z.object({
      to: z.string().trim().email('Enter the provider’s support email.'),
      subject: z.string().trim().min(3).max(200),
      body: z.string().trim().min(20).max(6000),
      kind: z.enum(['cancel', 'followup', 'escalate']).default('cancel'),
      // Must be true: sent only on the traveller's explicit tap.
      confirm: z.literal(true),
    }),
  );
  const userId = c.get('userId');
  const { db } = await getDb();
  const [r] = await db.select().from(s.cancellationRequests).where(and(eq(s.cancellationRequests.id, id), eq(s.cancellationRequests.userId, userId))).limit(1);
  if (!r) throw new AppError(404, 'not_found', 'We could not find that cancellation.');
  const [u] = await db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, userId)).limit(1);
  const msg = await sendOutbound({ userId, channel: 'email', to: body.to, cc: u?.email ?? null, replyTo: u?.email ?? alias(id), subject: body.subject, body: body.body, relatedType: 'cancellation', relatedId: id });
  await record(id, 'email', 'user', msg.status === 'sent' ? `Email sent to ${body.to}` : `Email saved to your Outbox (demo mode: not sent) for ${body.to}`, { data: { outboxId: msg.id, kind: body.kind } });
  if (r.status === 'quoted') await move(id, userId, 'user_confirmed', 'user', 'You confirmed the cancellation.');
  const [now] = await db.select().from(s.cancellationRequests).where(eq(s.cancellationRequests.id, id)).limit(1);
  if (now.status === 'user_confirmed') await move(id, userId, 'submitted', 'user', 'Cancellation request sent to the provider.');
  const [fresh] = await db.select().from(s.cancellationRequests).where(eq(s.cancellationRequests.id, id)).limit(1);
  return c.json({ request: fresh, outbox: msg });
});

// ---------- Tracking ----------

cancellations.post('/cancellations/:id/status', async (c) => {
  const id = parse(z.string().uuid(), c.req.param('id'));
  const body = await jsonBody(c, z.object({ to: z.enum(['acknowledged', 'processing', 'refunded', 'partially_refunded', 'rejected', 'disputed']), amountInr: z.number().int().min(0).max(10_000_000).optional(), note: z.string().max(300).optional(), creditShell: z.object({ code: z.string().max(40).optional(), expiresOn: z.string().optional() }).optional() }));
  const userId = c.get('userId');
  const { db } = await getDb();
  const r = await move(id, userId, body.to, 'user', body.note ?? null, body.amountInr != null ? { refundedInr: body.amountInr } : {});
  const snap = r.booking as Snapshot;
  if (body.creditShell) {
    await db.insert(s.creditShells).values({ userId, bookingId: r.bookingId, provider: snap.provider ?? snap.title, amountInr: body.amountInr ?? 0, code: body.creditShell.code ?? null, expiresOn: body.creditShell.expiresOn ?? null });
    await record(id, 'note', 'user', 'Credit shell / voucher recorded.');
  }
  return c.json({ request: r });
});

cancellations.get('/cancellations', async (c) => {
  const { db } = await getDb();
  const rows = await db.select().from(s.cancellationRequests).where(eq(s.cancellationRequests.userId, c.get('userId'))).orderBy(desc(s.cancellationRequests.updatedAt));
  const now = new Date();
  return c.json({ requests: rows.map((r) => ({ ...r, followUpDue: followUpDue(r.status as CancelState, r.statusChangedAt.toISOString(), now), overdue: !!r.expectedBy && r.expectedBy < now && !['refunded', 'rejected'].includes(r.status) })) });
});

cancellations.get('/cancellations/:id', async (c) => {
  const id = parse(z.string().uuid(), c.req.param('id'));
  const { db } = await getDb();
  const [r] = await db.select().from(s.cancellationRequests).where(and(eq(s.cancellationRequests.id, id), eq(s.cancellationRequests.userId, c.get('userId')))).limit(1);
  if (!r) throw new AppError(404, 'not_found', 'We could not find that cancellation.');
  const [events, quotes, emails] = await Promise.all([
    db.select().from(s.refundEvents).where(eq(s.refundEvents.requestId, id)).orderBy(asc(s.refundEvents.id)),
    db.select().from(s.refundQuotes).where(eq(s.refundQuotes.requestId, id)).orderBy(desc(s.refundQuotes.id)).limit(1),
    db.select().from(s.outboundMessages).where(and(eq(s.outboundMessages.relatedType, 'cancellation'), eq(s.outboundMessages.relatedId, id))).orderBy(desc(s.outboundMessages.createdAt)),
  ]);
  const now = new Date();
  const snap = r.booking as Snapshot;
  return c.json({
    request: r,
    quote: quotes[0] ?? null,
    events,
    emails,
    followUpDue: followUpDue(r.status as CancelState, r.statusChangedAt.toISOString(), now),
    overdue: !!r.expectedBy && r.expectedBy < now && !['refunded', 'rejected'].includes(r.status),
    ladder: ESCALATION_LADDER.filter((l) => snap.kind === 'flight' || l.step !== 'airsewa'),
  });
});

/** Background follow-ups: drafts after 3/7 days; sent (to the Outbox in demo mode) only if opted in. */
export async function runFollowUps(now = new Date()) {
  const { db } = await getDb();
  const open = await db.select().from(s.cancellationRequests).where(inArray(s.cancellationRequests.status, ['submitted', 'acknowledged', 'processing']));
  let drafted = 0;
  for (const r of open) {
    if (!followUpDue(r.status as CancelState, r.statusChangedAt.toISOString(), now)) continue;
    const events = await db.select().from(s.refundEvents).where(and(eq(s.refundEvents.requestId, r.id), eq(s.refundEvents.type, 'followup')));
    if (events.some((e) => Date.parse(e.createdAt.toISOString()) > Date.parse(r.statusChangedAt.toISOString()))) continue; // once per stage
    const draft = templateEmail(r.booking as Snapshot, r.reason, 'followup');
    const lastEmail = (await db.select().from(s.outboundMessages).where(and(eq(s.outboundMessages.relatedType, 'cancellation'), eq(s.outboundMessages.relatedId, r.id))).orderBy(desc(s.outboundMessages.createdAt)).limit(1))[0];
    if (r.autoFollowUp && lastEmail) {
      const msg = await sendOutbound({ userId: r.userId, channel: 'email', to: lastEmail.toAddress, cc: lastEmail.cc, replyTo: lastEmail.replyTo, ...draft, relatedType: 'cancellation', relatedId: r.id });
      await record(r.id, 'followup', 'system', msg.status === 'sent' ? 'Follow-up sent automatically (you opted in).' : 'Follow-up written to your Outbox (demo mode).', { data: { outboxId: msg.id } });
    } else {
      await record(r.id, 'followup', 'system', 'No reply yet: a follow-up email is ready for you to review and send.', { data: draft });
    }
    drafted++;
  }
  return drafted;
}

// ---------- Inbound replies (provider emails to the refunds+ alias) ----------

/** Pull an amount, a reference and a "processed" signal out of a reply, as a suggestion. */
export function readReply(text: string) {
  const amount = text.match(/(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  // A reference has at least one digit ("RF12345678"), so words like "reference" never match.
  const ref = text.match(/\b(?:reference|ref|arn|utr|refund id)\s*(?:no\.?|number|id|#)?\s*[:#-]?\s*((?=[A-Z0-9]*\d)[A-Z0-9]{6,24})\b/i)?.[1];
  const processed = /\b(processed|refunded|credited|initiated)\b/i.test(text);
  const rejected = /\b(rejected|not eligible|cannot be refunded|declined)\b/i.test(text);
  return { amountInr: amount ? Math.round(Number(amount.replace(/,/g, ''))) : null, reference: ref ?? null, suggests: rejected ? ('rejected' as const) : processed ? ('refunded' as const) : ('acknowledged' as const) };
}

cancellations.post('/inbound/email/:secret', async (c) => {
  if (!process.env.INBOUND_EMAIL_SECRET || c.req.param('secret') !== process.env.INBOUND_EMAIL_SECRET) throw new AppError(401, 'unauthorized', 'Unknown inbound hook.');
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const json = c.req.header('content-type')?.includes('json') ? ((await c.req.json().catch(() => ({}))) as Record<string, unknown>) : {};
  const to = String(form.to ?? json.To ?? '');
  const text = String(form.text ?? json.TextBody ?? '').slice(0, 20_000);
  const short = to.match(/refunds\+([0-9a-f]{8})@/i)?.[1];
  if (!short) return c.json({ ok: true, matched: false });
  const { db } = await getDb();
  const all = await db.select({ id: s.cancellationRequests.id }).from(s.cancellationRequests);
  const match = all.find((r) => r.id.startsWith(short.toLowerCase()));
  if (!match) return c.json({ ok: true, matched: false });
  const suggestion = readReply(text);
  await record(match.id, 'reply', 'provider', 'Reply received from the provider.', { data: { excerpt: text.slice(0, 600) } });
  await record(match.id, 'suggestion', 'system', `Suggested update: ${suggestion.suggests}${suggestion.amountInr ? `, Rs ${suggestion.amountInr}` : ''}. Please confirm.`, { data: suggestion });
  return c.json({ ok: true, matched: true });
});

// ---------- Provider contacts ----------

cancellations.get('/providers/contacts', async (c) => {
  const { db } = await getDb();
  return c.json({ contacts: await db.select().from(s.providerContacts).orderBy(asc(s.providerContacts.name)) });
});

// ---------- Outbox ----------

cancellations.get('/outbox', requireUser, async (c) => {
  const { db } = await getDb();
  const rows = await db.select().from(s.outboundMessages).where(eq(s.outboundMessages.userId, c.get('userId'))).orderBy(desc(s.outboundMessages.createdAt)).limit(100);
  return c.json({ messages: rows, realSending: process.env.ALLOW_REAL_OUTBOUND === 'true' });
});
