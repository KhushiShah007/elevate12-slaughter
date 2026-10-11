import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, jsonBody, parse } from '../http';
import { notifySafe } from '../notify/service';
import { requireUser } from '../auth';
import { buildGuide, type Guide } from '../guide';
import { getWeather } from './live';
import { textPdf } from '../pdf';
import { derivePersona, defaultPersona } from '../../src/engines/persona';
import { budgetStyle, placeReason } from '../../src/engines/personalize';
import { budgetPlan, DEFAULT_SPLIT, tripDays } from '../../src/engines/budget';
import { adaptDay, diffPlans, EMERGENCY, planTrip, type AdaptMode, type Place, type Plan } from '../../src/engines/planner';

// The living itinerary: generated from the trip, persona, budget, weather and hours,
// adapted on request ("I feel sick"), versioned with a diff and Undo, and pushed to every
// open device as it changes.

export const itinerary = new Hono<{ Variables: { userId: string } }>();
itinerary.use('/itineraries/*', requireUser);

// ---------- Live updates (Server-Sent Events) ----------

type Listener = (msg: { version: number; reason: string }) => void;
const listeners = new Map<string, Set<Listener>>();
function publish(tripId: string, msg: { version: number; reason: string }) {
  for (const l of listeners.get(tripId) ?? []) l(msg);
}

itinerary.get('/itineraries/:tripId/events', (c) => {
  const tripId = c.req.param('tripId');
  return streamSSE(c, async (stream) => {
    const set = listeners.get(tripId) ?? new Set<Listener>();
    listeners.set(tripId, set);
    const l: Listener = (msg) => void stream.writeSSE({ event: 'version', data: JSON.stringify(msg) });
    set.add(l);
    stream.onAbort(() => {
      set.delete(l);
    });
    // Keep the connection open; a comment every 25 s stops proxies closing it.
    while (!stream.aborted) {
      await stream.writeSSE({ event: 'ping', data: '' });
      await stream.sleep(25_000);
    }
    set.delete(l);
  });
});

// ---------- Inputs ----------

async function tripContext(userId: string, tripId: string) {
  const { db } = await getDb();
  const [trip] = await db.select().from(s.trips).where(and(eq(s.trips.id, tripId), eq(s.trips.userId, userId))).limit(1);
  if (!trip) throw new AppError(404, 'not_found', 'Save the trip first, then the itinerary can be built.');
  const [dest] = trip.destinationId
    ? await db.select().from(s.destinations).where(eq(s.destinations.id, trip.destinationId)).limit(1)
    : await db.select().from(s.destinations).where(eq(s.destinations.name, trip.destinationName)).limit(1);
  if (!dest) throw new AppError(404, 'no_guide', `We do not have a city guide for ${trip.destinationName} yet.`);
  const [profile] = await db.select({ answers: s.profiles.personaAnswers, notes: s.profiles.personaNotes }).from(s.profiles).where(eq(s.profiles.userId, userId)).limit(1);
  const persona = profile?.answers ? derivePersona(profile.answers, profile.notes ?? {}) : defaultPersona();
  // With a trip budget, price places at the style the money actually covers on the ground
  // (after about 35% for getting there); otherwise use the persona's style.
  const onGround = trip.budgetInr ? (trip.budgetInr * 0.65) / tripDays(trip.startDate, trip.endDate) / trip.travellers : null;
  const styles = ['luxury', 'comfort', 'moderate', 'shoestring'] as const;
  const style = onGround && dest.dailyCostInr ? (styles.find((st) => dest.dailyCostInr![st] <= onGround) ?? 'shoestring') : budgetStyle(persona);
  const guide = (await buildGuide(dest.slug, style))!;
  // The trip's own budget split (kept on the device record) when set.
  const [rec] = await db.select({ payload: s.userRecords.payload }).from(s.userRecords).where(and(eq(s.userRecords.userId, userId), eq(s.userRecords.tbl, 'trips'), eq(s.userRecords.recordId, tripId))).limit(1);
  const split = (rec?.payload as { budgetSplit?: Record<string, number> } | undefined)?.budgetSplit ?? DEFAULT_SPLIT;
  const days = tripDays(trip.startDate, trip.endDate);
  const idx = dest.dailyCostInr?.[style] ?? 4000;
  const allowance = trip.budgetInr
    ? (() => {
        const d = budgetPlan(trip.budgetInr!, split, days, trip.travellers).daily;
        return { meal: d.meal, activities: d.activities };
      })()
    : { meal: Math.round(idx * 0.15), activities: Math.round(idx * 0.13) };
  return { trip, dest, persona, style, guide, allowance, paidEntryEstimate: Math.round(idx * 0.13 * 0.5) };
}

function placesFrom(guide: Guide, persona: ReturnType<typeof derivePersona>): Place[] {
  const n = guide.see.length + guide.eat.length;
  return [
    ...guide.see.map((p, i) => ({ id: `see-${p.id}`, kind: 'see' as const, name: p.name, category: p.category, lat: p.lat, lon: p.lon, openingHours: p.openingHours, entry: p.entry, costRange: null, vegetarian: null, score: (placeReason(p.category, persona) ? 100 : 0) + (n - i), link: p.mapUrl })),
    ...guide.eat.map((p, i) => ({ id: `eat-${p.id}`, kind: 'eat' as const, name: p.name, category: p.category, lat: p.lat, lon: p.lon, openingHours: p.openingHours, entry: null, costRange: p.costRange, vegetarian: p.vegetarian, score: (persona.vegFirst && p.vegetarian ? 100 : 0) + (n - i), link: p.mapUrl })),
  ];
}

async function rainDates(slug: string) {
  try {
    const w = await getWeather(slug);
    return (w?.days ?? []).filter((d) => (d.rainChance ?? 0) >= 60 || /rain|shower|thunder/i.test(d.summary)).map((d) => d.date);
  } catch {
    return [];
  }
}

async function save(userId: string, tripId: string, plan: Plan, reason: string, changes: string[], baseVersion?: number) {
  const { db } = await getDb();
  const [cur] = await db.select().from(s.itineraries).where(eq(s.itineraries.tripId, tripId)).limit(1);
  if (cur && cur.userId !== userId) throw new AppError(404, 'not_found', 'Not your itinerary.');
  if (cur && baseVersion != null && baseVersion !== cur.version) throw new AppError(409, 'stale', 'The itinerary changed on another device. It has been refreshed.');
  let row;
  if (!cur) [row] = await db.insert(s.itineraries).values({ userId, tripId, plan, version: 1 }).returning();
  else {
    [row] = await db
      .update(s.itineraries)
      .set({ plan, version: cur.version + 1, updatedAt: new Date() })
      .where(and(eq(s.itineraries.id, cur.id), eq(s.itineraries.version, cur.version)))
      .returning();
    if (!row) throw new AppError(409, 'stale', 'The itinerary changed on another device. It has been refreshed.');
  }
  await db.insert(s.itineraryVersions).values({ itineraryId: row.id, version: row.version, reason, changes, plan });
  publish(tripId, { version: row.version, reason });
  return row;
}

async function current(userId: string, tripId: string) {
  const { db } = await getDb();
  const [row] = await db.select().from(s.itineraries).where(and(eq(s.itineraries.tripId, tripId), eq(s.itineraries.userId, userId))).limit(1);
  return row ?? null;
}

async function view(userId: string, tripId: string) {
  const { db } = await getDb();
  const row = await current(userId, tripId);
  if (!row) return { itinerary: null };
  const versions = await db
    .select({ version: s.itineraryVersions.version, reason: s.itineraryVersions.reason, changes: s.itineraryVersions.changes, createdAt: s.itineraryVersions.createdAt })
    .from(s.itineraryVersions)
    .where(eq(s.itineraryVersions.itineraryId, row.id))
    .orderBy(desc(s.itineraryVersions.version))
    .limit(20);
  return { itinerary: { tripId, version: row.version, plan: row.plan as Plan, updatedAt: row.updatedAt }, versions };
}

// ---------- Routes ----------

itinerary.get('/itineraries/:tripId', async (c) => c.json(await view(c.get('userId'), c.req.param('tripId'))));

itinerary.post('/itineraries/:tripId/generate', async (c) => {
  const userId = c.get('userId');
  const tripId = c.req.param('tripId');
  const ctx = await tripContext(userId, tripId);
  const pace = ctx.persona.resolved.pace;
  const plan = planTrip({
    startDate: ctx.trip.startDate,
    endDate: ctx.trip.endDate,
    places: placesFrom(ctx.guide, ctx.persona),
    allowance: ctx.allowance,
    maxIntensityPerDay: pace === 'slow' || ctx.persona.id === 'family' ? 6 : pace === 'packed' ? 12 : 9,
    restBreak: ctx.persona.id === 'family' || ctx.persona.id === 'slow',
    vegOnly: ctx.persona.vegFirst,
    rainDates: await rainDates(ctx.dest.slug),
    paidEntryEstimate: ctx.paidEntryEstimate,
  });
  const before = await current(userId, tripId);
  const row = await save(userId, tripId, plan, before ? 'Rebuilt the plan' : 'First plan', before ? diffPlans(before.plan as Plan, plan) : ['Planned every day']);
  // Packing reminder the evening before the trip (18:00 IST = 12:30 UTC).
  const packAt = new Date(`${ctx.trip.startDate}T12:30:00Z`);
  packAt.setUTCDate(packAt.getUTCDate() - 1);
  if (packAt.getTime() > Date.now()) void notifySafe({ userId, tripId, kind: 'packing_reminder', title: 'Pack for tomorrow', body: `Your trip to ${ctx.dest.name} starts tomorrow. Check your packing list.`, dedupeKey: `packing:${tripId}:${ctx.trip.startDate}`, dueAt: packAt, link: `/trips/${tripId}/packing` });
  return c.json({ ...(await view(userId, tripId)), version: row.version });
});

const adaptBody = z.object({
  mode: z.enum(['sick', 'tired', 'lighter', 'rain', 'late', 'skip', 'add', 'overspend']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  itemId: z.string().max(120).optional(),
  minutes: z.number().int().min(5).max(360).optional(),
  placeId: z.string().regex(/^(see|eat)-\d+$/).optional(),
  baseVersion: z.number().int().min(1),
});
const REASON: Record<AdaptMode, string> = {
  sick: 'Feeling sick',
  tired: 'Tired / low energy',
  lighter: 'Wanted a lighter day',
  rain: 'Rain / bad weather',
  late: 'Running late',
  skip: 'Skipped an item',
  add: 'Added something',
  overspend: 'Over budget today',
};

/** Shared by the API and the assistant ("I feel sick today"). */
export async function adaptItinerary(userId: string, tripId: string, body: z.infer<typeof adaptBody>) {
  const row = await current(userId, tripId);
  if (!row) throw new AppError(404, 'not_found', 'Build the itinerary first.');
  if (body.baseVersion !== row.version) throw new AppError(409, 'stale', 'The itinerary changed on another device. It has been refreshed.');
  const ctx = await tripContext(userId, tripId);
  const pool = placesFrom(ctx.guide, ctx.persona);
  const place = body.placeId ? pool.find((p) => p.id === body.placeId) : undefined;
  if (body.mode === 'add' && !place) throw new AppError(400, 'invalid_input', 'Pick a place to add.');
  const r = adaptDay(row.plan as Plan, body.mode, { date: body.date, itemId: body.itemId, minutes: body.minutes, place, pool, allowance: ctx.allowance, paidEntryEstimate: ctx.paidEntryEstimate });
  if (!r.changes.length) return { changed: false, warnings: r.warnings, ...(await view(userId, tripId)) };
  await save(userId, tripId, r.plan, REASON[body.mode], r.changes, row.version);
  void notifySafe({ userId, tripId, kind: 'itinerary_change', title: 'Itinerary updated', body: `${REASON[body.mode]}: ${r.changes.slice(0, 2).join('; ')}`.slice(0, 300), dedupeKey: `itin:${tripId}:${row.version + 1}`, link: `/trips/${tripId}/itinerary` });
  const emergency = body.mode === 'sick' ? { country: ctx.dest.country, numbers: EMERGENCY[ctx.dest.country] ?? { all: '112' }, pharmacy: `https://www.google.com/maps/search/pharmacy/@${ctx.dest.lat},${ctx.dest.lon},14z`, hospital: `https://www.google.com/maps/search/hospital/@${ctx.dest.lat},${ctx.dest.lon},14z` } : null;
  return { changed: true, changes: r.changes, warnings: r.warnings, emergency, ...(await view(userId, tripId)) };
}

itinerary.post('/itineraries/:tripId/adapt', async (c) => {
  const body = await jsonBody(c, adaptBody);
  return c.json(await adaptItinerary(c.get('userId'), c.req.param('tripId'), body));
});

itinerary.post('/itineraries/:tripId/undo', async (c) => {
  const { baseVersion } = await jsonBody(c, z.object({ baseVersion: z.number().int().min(2) }));
  const userId = c.get('userId');
  const tripId = c.req.param('tripId');
  const row = await current(userId, tripId);
  if (!row || row.version !== baseVersion) throw new AppError(409, 'stale', 'The itinerary changed on another device. It has been refreshed.');
  const { db } = await getDb();
  const [prev] = await db.select().from(s.itineraryVersions).where(and(eq(s.itineraryVersions.itineraryId, row.id), eq(s.itineraryVersions.version, row.version - 1))).limit(1);
  if (!prev) throw new AppError(400, 'nothing_to_undo', 'Nothing to undo.');
  await save(userId, tripId, prev.plan as Plan, 'Undo', diffPlans(row.plan as Plan, prev.plan as Plan), row.version);
  return c.json(await view(userId, tripId));
});

itinerary.post('/itineraries/:tripId/lock', async (c) => {
  const body = await jsonBody(c, z.object({ itemId: z.string().max(120), locked: z.boolean(), baseVersion: z.number().int().min(1) }));
  const userId = c.get('userId');
  const tripId = c.req.param('tripId');
  const row = await current(userId, tripId);
  if (!row) throw new AppError(404, 'not_found', 'Build the itinerary first.');
  const plan = JSON.parse(JSON.stringify(row.plan)) as Plan;
  const item = plan.days.flatMap((d) => d.items).find((i) => i.id === body.itemId);
  if (!item) throw new AppError(404, 'not_found', 'That item is gone.');
  item.locked = body.locked;
  await save(userId, tripId, plan, body.locked ? `Locked ${item.title}` : `Unlocked ${item.title}`, [], body.baseVersion);
  return c.json(await view(userId, tripId));
});

/** Export: a PDF of the plan, or an .ics calendar (Google Calendar and phones import it). */
itinerary.get('/itineraries/:tripId/export/:fmt', async (c) => {
  const fmt = parse(z.enum(['pdf', 'ics']), c.req.param('fmt'));
  const v = await view(c.get('userId'), c.req.param('tripId'));
  if (!v.itinerary) throw new AppError(404, 'not_found', 'Build the itinerary first.');
  const plan = v.itinerary.plan;
  if (fmt === 'pdf') {
    const lines = [{ text: 'Voyage itinerary', size: 18, bold: true }];
    for (const d of plan.days) {
      lines.push({ text: `${d.date} - ${d.title}`, size: 13, bold: true, gap: 12 } as never);
      for (const i of d.items.filter((x) => x.status === 'planned')) lines.push({ text: `${i.start}-${i.end}  ${i.title}${i.costPerPerson ? `  (about Rs ${i.costPerPerson} pp)` : ''}`, size: 10 } as never);
    }
    return new Response(textPdf(lines), { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="itinerary.pdf"' } });
  }
  const stamp = (date: string, t: string) => `${date.replace(/-/g, '')}T${t.replace(':', '')}00`;
  const esc = (t: string) => t.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const events = plan.days.flatMap((d) =>
    d.items
      .filter((i) => i.status === 'planned')
      .map((i) => ['BEGIN:VEVENT', `UID:${i.id}@voyage`, `DTSTAMP:${stamp(d.date, '00:00')}`, `DTSTART:${stamp(d.date, i.start)}`, `DTEND:${stamp(d.date, i.end)}`, `SUMMARY:${esc(i.title)}`, ...(i.link ? [`URL:${i.link}`] : []), 'END:VEVENT'].join('\r\n')),
  );
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Voyage//Itinerary//EN', ...events, 'END:VCALENDAR'].join('\r\n');
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="itinerary.ics"' } });
});
