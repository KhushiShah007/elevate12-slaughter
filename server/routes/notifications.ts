import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, jsonBody, parse } from '../http';
import { requireUser } from '../auth';
import { acknowledge, getPrefs, notify, runDue, stopMessages } from '../notify/service';

export const notifications = new Hono<{ Variables: { userId: string } }>();
notifications.use('/notifications', requireUser);
notifications.use('/notifications/me/*', requireUser);

const id = z.string().uuid();

/** List (and deliver anything due for this user: the app's polling doubles as the scheduler). */
notifications.get('/notifications', async (c) => {
  const userId = c.get('userId');
  await runDue(new Date(), userId).catch(() => 0);
  const { db } = await getDb();
  const rows = await db.select().from(s.notifications).where(eq(s.notifications.userId, userId)).orderBy(desc(s.notifications.dueAt)).limit(60);
  const now = Date.now();
  const visible = rows.filter((r) => r.dueAt.getTime() <= now || r.status !== 'scheduled');
  const upcoming = rows.filter((r) => r.dueAt.getTime() > now && r.status === 'scheduled');
  return c.json({
    notifications: visible,
    upcoming: upcoming.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    unread: visible.filter((r) => !r.readAt).length,
    needsAck: visible.filter((r) => r.critical && (r.status === 'escalating' || r.status === 'delivered') && !r.ackAt).length,
  });
});

notifications.get('/notifications/me/:id/events', async (c) => {
  const nid = parse(id, c.req.param('id'));
  const { db } = await getDb();
  const [n] = await db.select({ id: s.notifications.id }).from(s.notifications).where(and(eq(s.notifications.id, nid), eq(s.notifications.userId, c.get('userId')))).limit(1);
  if (!n) throw new AppError(404, 'not_found', 'Notification not found.');
  const events = await db.select().from(s.notificationEvents).where(eq(s.notificationEvents.notificationId, nid)).orderBy(asc(s.notificationEvents.at), asc(s.notificationEvents.id));
  return c.json({ events });
});

notifications.post('/notifications/me/:id/ack', async (c) => {
  const n = await acknowledge(c.get('userId'), parse(id, c.req.param('id')), 'in_app');
  return c.json({ ok: true, notification: n });
});

notifications.post('/notifications/me/read-all', async (c) => {
  const { db } = await getDb();
  await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, c.get('userId')), isNull(s.notifications.readAt)));
  return c.json({ ok: true });
});

notifications.get('/notifications/me/prefs', async (c) => c.json({ prefs: await getPrefs(c.get('userId')) }));

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const prefsBody = z.object({
  channels: z.object({ push: z.boolean(), email: z.boolean(), sms: z.boolean(), whatsapp: z.boolean(), voice: z.boolean() }),
  phone: z.string().trim().regex(/^\+?[0-9 ]{10,16}$/, 'Enter a mobile number with country code').nullable(),
  email: z.string().trim().email().max(200).nullable(),
  timezone: z.string().max(60).refine(validTz, 'Unknown time zone'),
  quietStart: z.number().int().min(0).max(1439),
  quietEnd: z.number().int().min(0).max(1439),
  dailyCapInr: z.number().int().min(0).max(500),
});
notifications.put('/notifications/me/prefs', async (c) => {
  const b = await jsonBody(c, prefsBody);
  const userId = c.get('userId');
  const { db } = await getDb();
  const prev = await getPrefs(userId);
  // Switching SMS/WhatsApp back on is a fresh opt-in after a STOP.
  const reOptIn = (b.channels.sms && !prev.channels.sms) || (b.channels.whatsapp && !prev.channels.whatsapp);
  const values = { channels: b.channels, phone: b.phone, email: b.email, timezone: b.timezone, quietStart: b.quietStart, quietEnd: b.quietEnd, dailyCapInr: b.dailyCapInr, smsStopped: reOptIn ? false : prev.smsStopped, updatedAt: new Date() };
  await db.insert(s.notificationPrefs).values({ userId, ...values }).onConflictDoUpdate({ target: s.notificationPrefs.userId, set: values });
  return c.json({ prefs: await getPrefs(userId) });
});

const SCENARIOS = {
  flight_delay: { kind: 'flight_status', title: 'Flight delayed by 1 h 40 min', body: 'Your flight now leaves at 21:15. Gate unchanged.' },
  gate_change: { kind: 'flight_status', title: 'Gate changed to 42B', body: 'Your boarding gate moved. Boarding starts in 35 minutes.' },
  flight_cancelled: { kind: 'flight_status', title: 'Flight cancelled', body: 'The airline cancelled your flight. Open Voyage to rebook or claim a refund.' },
  leave_by: { kind: 'leave_by', title: 'Leave for the airport by 18:30', body: 'Traffic is heavy. Leave by 18:30 to reach with check-in time to spare.' },
} as const;

/** Demo: raise a critical alert now and watch it escalate (one-minute windows when fast). */
notifications.post('/notifications/me/demo', async (c) => {
  const b = await jsonBody(c, z.object({ scenario: z.enum(['flight_delay', 'gate_change', 'flight_cancelled', 'leave_by']), fast: z.boolean().default(true) }));
  const sc = SCENARIOS[b.scenario];
  const userId = c.get('userId');
  const row = await notify({
    userId,
    kind: sc.kind,
    title: sc.title,
    body: `${sc.body} (Demo alert)`,
    critical: true,
    dedupeKey: `demo:${userId}:${b.scenario}:${Date.now()}`,
    leaveBy: b.scenario === 'leave_by' ? new Date(Date.now() + 90 * 60_000) : null,
    fast: b.fast,
  });
  await runDue(new Date(), userId);
  return c.json({ notification: row });
});

// ---------- Scheduler trigger and provider callbacks (no session) ----------

/** Vercel Cron (Authorization: Bearer CRON_SECRET). */
notifications.get('/cron/tick', async (c) => {
  const secret = process.env.CRON_SECRET;
  const auth = c.req.header('authorization') ?? '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw new AppError(401, 'unauthenticated', 'Not allowed.');
  return c.json({ processed: await runDue() });
});

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Twilio request signature: base64(HMAC-SHA1(auth token, full URL + sorted form params)). */
export function twilioSignature(token: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return createHmac('sha1', token).update(data).digest('base64');
}

async function verifiedTwilioForm(c: Context) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) throw new AppError(403, 'forbidden', 'Twilio is not configured.');
  const form = Object.fromEntries(Object.entries(await c.req.parseBody()).map(([k, v]) => [k, String(v)]));
  const u = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto') ?? u.protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? u.host;
  const url = `${proto}://${host}${u.pathname}${u.search}`;
  if (!safeEqual(c.req.header('x-twilio-signature') ?? '', twilioSignature(token, url, form))) throw new AppError(403, 'forbidden', 'Bad signature.');
  return form;
}

const twiml = (c: Context, inner = '') => c.body(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, 200, { 'content-type': 'text/xml' });

/** Incoming SMS: STOP opts out; "1" acknowledges the latest critical alert. */
notifications.post('/notifications/inbound/sms', async (c) => {
  const form = await verifiedTwilioForm(c);
  const text = (form.Body ?? '').trim().toUpperCase();
  if (/^(STOP|UNSUBSCRIBE|CANCEL|END|QUIT)$/.test(text)) {
    await stopMessages(form.From ?? '');
    return twiml(c, '<Message>You will get no more Voyage SMS or WhatsApp messages. Turn them back on in the app.</Message>');
  }
  if (text === '1') await ackLatestFor(form.From ?? '', 'sms');
  return twiml(c);
});

/** Voice call keypad: pressing 1 acknowledges. */
notifications.post('/notifications/inbound/voice', async (c) => {
  const form = await verifiedTwilioForm(c);
  const nid = parse(id, c.req.query('n'));
  if (form.Digits === '1') {
    const { db } = await getDb();
    const [n] = await db.select({ userId: s.notifications.userId }).from(s.notifications).where(eq(s.notifications.id, nid)).limit(1);
    if (n) await acknowledge(n.userId, nid, 'voice');
    return twiml(c, '<Say>Thank you. Acknowledged.</Say>');
  }
  return twiml(c, '<Say>No problem. We will try again later.</Say>');
});

async function ackLatestFor(phone: string, via: string) {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return;
  const { db } = await getDb();
  const [user] = await db.select({ id: s.users.id }).from(s.users).where(sql`right(regexp_replace(coalesce(${s.users.phone}, ''), '[^0-9]', '', 'g'), 10) = ${digits}`).limit(1);
  if (!user) return;
  const [n] = await db
    .select({ id: s.notifications.id })
    .from(s.notifications)
    .where(and(eq(s.notifications.userId, user.id), eq(s.notifications.critical, true), eq(s.notifications.status, 'escalating')))
    .orderBy(desc(s.notifications.dueAt))
    .limit(1);
  if (n) await acknowledge(user.id, n.id, via);
}
