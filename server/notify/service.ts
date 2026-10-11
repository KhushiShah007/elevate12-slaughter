import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { getDb, schema as s } from '../db/client';
import { maskAddress, sendOutbound } from '../outbound';
import { defaultPrefs, localMinutes, planStep, type NotifyChannel, type Prefs } from './escalation';

// Notification service. Rows in `notifications` are the durable schedule (UTC); `runDue`
// processes what is due. It is idempotent (each row is claimed with a compare-and-set on
// next_at) and is triggered by Vercel Cron, a dev-server timer, and the app's own polling.
// All sending goes through sendOutbound, so demo mode only writes to the Outbox.

export interface NotifyInput {
  userId: string;
  kind: 'booking_confirmed' | 'flight_status' | 'cancel_deadline' | 'refund_update' | 'itinerary_change' | 'packing_reminder' | 'leave_by';
  title: string;
  body: string;
  dedupeKey: string;
  critical?: boolean;
  tripId?: string | null;
  link?: string | null;
  dueAt?: Date;
  leaveBy?: Date | null;
  fast?: boolean;
}

/** Schedule a notification once per dedupe key. Returns the row, or null if it already existed. */
export async function notify(n: NotifyInput) {
  const { db } = await getDb();
  const due = n.dueAt ?? new Date();
  const [row] = await db
    .insert(s.notifications)
    .values({
      userId: n.userId,
      kind: n.kind,
      title: n.title.slice(0, 140),
      body: n.body.slice(0, 600),
      dedupeKey: n.dedupeKey,
      critical: n.critical ?? false,
      tripId: n.tripId ?? null,
      link: n.link ?? null,
      dueAt: due,
      nextAt: due,
      leaveBy: n.leaveBy ?? null,
      fast: n.fast ?? false,
    })
    .onConflictDoNothing({ target: s.notifications.dedupeKey })
    .returning();
  return row ?? null;
}

/** Fire-and-forget wrapper for event hooks: a notification problem never breaks the main action. */
export function notifySafe(n: NotifyInput) {
  return notify(n)
    .then(() => maybeTick())
    .catch((err) => console.error('[notify]', (err as Error).message));
}

export async function getPrefs(userId: string): Promise<Prefs> {
  const { db } = await getDb();
  const [p] = await db.select().from(s.notificationPrefs).where(eq(s.notificationPrefs.userId, userId)).limit(1);
  const [u] = await db.select({ email: s.users.email, phone: s.users.phone }).from(s.users).where(eq(s.users.id, userId)).limit(1);
  const base = defaultPrefs();
  if (!p) return { ...base, email: u?.email ?? null, phone: u?.phone ?? null };
  return {
    channels: (p.channels ?? {}) as Prefs['channels'],
    phone: p.phone ?? u?.phone ?? null,
    email: p.email ?? u?.email ?? null,
    timezone: p.timezone,
    quietStart: p.quietStart,
    quietEnd: p.quietEnd,
    dailyCapInr: p.dailyCapInr,
    smsStopped: p.smsStopped,
  };
}

const outboundChannel: Record<NotifyChannel, 'push' | 'email' | 'sms' | 'whatsapp' | 'voice'> = { push: 'push', email: 'email', sms: 'sms', whatsapp: 'whatsapp', voice: 'voice' };

function messageFor(channel: NotifyChannel, n: { title: string; body: string; critical: boolean }) {
  if (channel === 'voice') return `This is an automated call from Voyage. ${n.title}. ${n.body} Press 1 to acknowledge.`;
  if (channel === 'sms') return `Voyage: ${n.title}. ${n.body}${n.critical ? ' Open the app to acknowledge.' : ''} Reply STOP to opt out.`;
  if (channel === 'whatsapp') return `${n.title}\n${n.body}${n.critical ? '\nReply 1 to acknowledge.' : ''}`;
  return `${n.title}\n\n${n.body}`;
}

async function log(notificationId: string, step: number, channel: string | null, action: string, detail: string | null, costInr = 0) {
  const { db } = await getDb();
  await db.insert(s.notificationEvents).values({ notificationId, step, channel, action, detail, costInr });
}

/** Paid sends today (local day) for the daily cap. */
async function spentToday(userId: string, prefs: Prefs, now: Date) {
  const { db } = await getDb();
  const since = new Date(now.getTime() - localMinutes(now, prefs.timezone) * 60_000);
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${s.notificationEvents.costInr}), 0)` })
    .from(s.notificationEvents)
    .innerJoin(s.notifications, eq(s.notifications.id, s.notificationEvents.notificationId))
    .where(and(eq(s.notifications.userId, userId), gte(s.notificationEvents.at, since)));
  return Number(r?.total ?? 0);
}

const REASON: Record<string, string> = {
  consent: 'not switched on',
  quiet: 'quiet hours',
  cap: 'daily limit reached',
  stopped: 'you replied STOP',
  no_address: 'no number or email saved',
  call_limit: 'already called twice',
};

/** Process one claimed notification at its current step. */
async function processOne(n: typeof s.notifications.$inferSelect, now: Date) {
  const { db } = await getDb();
  const prefs = await getPrefs(n.userId);
  const plan = planStep({ critical: n.critical, step: n.step, callAttempts: n.callAttempts, leaveBy: n.leaveBy, fast: n.fast }, prefs, now, await spentToday(n.userId, prefs, now));

  if (plan.deferUntil) {
    await db.update(s.notifications).set({ nextAt: plan.deferUntil }).where(eq(s.notifications.id, n.id));
    await log(n.id, n.step, null, 'deferred', 'Quiet hours: delivered when they end');
    return;
  }
  if (n.step === 0) await log(n.id, 0, 'in_app', 'sent', 'Shown in the app');
  else await log(n.id, n.step, null, 'escalated', 'No acknowledgement yet: trying the next channel');
  let calls = n.callAttempts;
  for (const send of plan.sends) {
    const row = await sendOutbound({ userId: n.userId, channel: outboundChannel[send.channel], to: send.to, subject: n.title, body: messageFor(send.channel, n), relatedType: 'notification', relatedId: n.id });
    if (send.channel === 'voice') calls += 1;
    await log(n.id, n.step, send.channel, row.status, `${row.status === 'dry_run' ? 'Demo mode: logged to Outbox' : row.status === 'sent' ? 'Sent' : 'Failed'} · to ${maskAddress(outboundChannel[send.channel], send.to)}`, send.costInr);
  }
  for (const skip of plan.skips) await log(n.id, n.step, skip.channel, `skipped_${skip.reason}`, REASON[skip.reason]);

  if (plan.next) {
    await db.update(s.notifications).set({ status: 'escalating', step: plan.next.step, nextAt: plan.next.at, callAttempts: calls }).where(eq(s.notifications.id, n.id));
    await log(n.id, n.step, null, 'waiting', `Waiting for Acknowledge until ${plan.next.at.toISOString()}`);
  } else {
    await db.update(s.notifications).set({ status: 'delivered', nextAt: null, callAttempts: calls }).where(eq(s.notifications.id, n.id));
    if (n.critical) await log(n.id, n.step, null, 'finished', 'All reminder steps used');
  }
}

/** Process everything due (optionally for one user). Safe to run concurrently. */
export async function runDue(now = new Date(), userId?: string) {
  const { db } = await getDb();
  const due = await db
    .select()
    .from(s.notifications)
    .where(and(inArray(s.notifications.status, ['scheduled', 'escalating']), isNotNull(s.notifications.nextAt), lte(s.notifications.nextAt, now), userId ? eq(s.notifications.userId, userId) : undefined))
    .orderBy(asc(s.notifications.nextAt))
    .limit(25);
  let processed = 0;
  for (const n of due) {
    // Claim: only one runner wins the compare-and-set on next_at; a crash retries after 2 minutes.
    const [claimed] = await db
      .update(s.notifications)
      .set({ nextAt: new Date(now.getTime() + 2 * 60_000) })
      .where(and(eq(s.notifications.id, n.id), eq(s.notifications.nextAt, n.nextAt!), inArray(s.notifications.status, ['scheduled', 'escalating'])))
      .returning();
    if (!claimed) continue;
    try {
      await processOne(n, now);
      processed++;
    } catch (err) {
      await log(n.id, n.step, null, 'failed', 'Will retry').catch(() => {});
      console.error('[notify] step failed', (err as Error).message);
    }
  }
  return processed;
}

const t = globalThis as unknown as { __voyageTick?: number; __voyageTimer?: ReturnType<typeof setInterval> };
/** Run the scheduler at most every 20 seconds per server instance. */
export async function maybeTick(userId?: string) {
  if (t.__voyageTick && Date.now() - t.__voyageTick < 20_000) return 0;
  t.__voyageTick = Date.now();
  return runDue(new Date(), userId).catch(() => 0);
}

/** Local dev server: a timer stands in for Vercel Cron. */
export function startDevScheduler() {
  if (process.env.VERCEL || process.env.VITEST || t.__voyageTimer) return;
  t.__voyageTimer = setInterval(() => void maybeTick(), 30_000);
  t.__voyageTimer.unref?.();
}

export async function acknowledge(userId: string, id: string, via: string) {
  const { db } = await getDb();
  const [n] = await db
    .update(s.notifications)
    .set({ status: 'acknowledged', ackAt: new Date(), nextAt: null, readAt: new Date() })
    .where(and(eq(s.notifications.id, id), eq(s.notifications.userId, userId), inArray(s.notifications.status, ['scheduled', 'escalating', 'delivered'])))
    .returning();
  if (n) await log(n.id, n.step, via, 'acknowledged', via === 'voice' ? 'Pressed 1 on the call' : 'Tapped Acknowledge');
  return n ?? null;
}

/** SMS "STOP": no more SMS or WhatsApp for this number. */
export async function stopMessages(phone: string) {
  const { db } = await getDb();
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return 0;
  const users = await db.select({ id: s.users.id }).from(s.users).where(sql`right(regexp_replace(coalesce(${s.users.phone}, ''), '[^0-9]', '', 'g'), 10) = ${digits}`);
  const prefs = await db.select({ userId: s.notificationPrefs.userId }).from(s.notificationPrefs).where(sql`right(regexp_replace(coalesce(${s.notificationPrefs.phone}, ''), '[^0-9]', '', 'g'), 10) = ${digits}`);
  const ids = [...new Set([...users, ...prefs].map((u) => (u as { id?: string; userId?: string }).id ?? (u as { userId: string }).userId))];
  for (const userId of ids) {
    await db.insert(s.notificationPrefs).values({ userId, smsStopped: true }).onConflictDoUpdate({ target: s.notificationPrefs.userId, set: { smsStopped: true, updatedAt: new Date() } });
  }
  return ids.length;
}
