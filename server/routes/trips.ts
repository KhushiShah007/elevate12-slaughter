import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s, type Db } from '../db/client';
import { AppError, jsonBody } from '../http';
import { requireUser } from '../auth';

// Saving the traveller's data.
//  - /sync: the device's offline queue pushes each change here (idempotent, with
//    revisions for conflicts) and pulls everything back on a new device.
//  - /trips/draft: the New Trip form autosaves here, so a half-filled trip survives.
//  - /trips: the account's trips, newest first.

export const trips = new Hono<{ Variables: { userId: string } }>();
trips.use('/sync/*', requireUser);
trips.use('/trips/*', requireUser);
trips.use('/trips', requireUser);

/** Device tables that sync. Anything else is refused. */
export const SYNC_TABLES = [
  'trips',
  'flights',
  'packingLists',
  'bookings',
  'documents',
  'journeyProgress',
  'preferences',
  'users',
  'expenses',
  'accommodations',
  'transport',
  'experiences',
  'restaurants',
  'itineraryDays',
  'itineraryItems',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Pick a date.');
/** What a trip record from the device must look like. */
export const tripPayload = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().trim().min(1, 'Give the trip a name.').max(80),
    from: z.string().trim().max(80).default(''),
    to: z.string().trim().min(1, 'Where are you going?').max(80),
    startDate: isoDate,
    endDate: isoDate,
    status: z.enum(['upcoming', 'active', 'completed']).default('upcoming'),
    travellers: z.number().int().min(1).max(20).default(1),
    destinationSlug: z.string().max(60).nullish(),
    budgetInr: z.number().int().min(0).max(100_000_000).nullish(),
  })
  .passthrough()
  .refine((t) => t.endDate.slice(0, 10) >= t.startDate.slice(0, 10), { message: 'The return date is before the start date.', path: ['endDate'] });

const pushBody = z.object({
  key: z.string().min(8).max(100),
  table: z.enum(SYNC_TABLES),
  recordId: z.string().min(1).max(120),
  op: z.enum(['put', 'delete']),
  payload: z.unknown(),
  baseRev: z.number().int().min(0),
});

type PushResult = { kind: 'applied'; rev: number } | { kind: 'duplicate' } | { kind: 'conflict'; serverRev: number; serverPayload: unknown };

/** Copy a trip into the typed table, so the server can list and reason about trips. */
async function mirrorTrip(db: Db, userId: string, op: 'put' | 'delete', recordId: string, payload: unknown) {
  if (op === 'delete') {
    await db.delete(s.trips).where(and(eq(s.trips.id, recordId), eq(s.trips.userId, userId)));
    return;
  }
  const t = tripPayload.parse(payload);
  const [dest] = t.destinationSlug ? await db.select({ id: s.destinations.id }).from(s.destinations).where(eq(s.destinations.slug, t.destinationSlug)).limit(1) : [];
  const row = {
    userId,
    title: t.title,
    origin: t.from || null,
    destinationId: dest?.id ?? null,
    destinationName: t.to,
    startDate: t.startDate.slice(0, 10),
    endDate: t.endDate.slice(0, 10),
    travellers: t.travellers,
    budgetInr: t.budgetInr ?? null,
    status: t.status,
    updatedAt: new Date(),
  };
  const [existing] = await db.select({ userId: s.trips.userId }).from(s.trips).where(eq(s.trips.id, t.id)).limit(1);
  if (existing && existing.userId !== userId) throw new AppError(409, 'id_taken', 'That trip id belongs to someone else.');
  await db.insert(s.trips).values({ id: t.id, ...row }).onConflictDoUpdate({ target: s.trips.id, set: row });
}

/** Apply one change from a device. `force` skips the conflict check (simulated other device). */
export async function applyChange(userId: string, change: z.infer<typeof pushBody>, force = false): Promise<PushResult> {
  const { db } = await getDb();
  const [receipt] = await db.select().from(s.syncReceipts).where(eq(s.syncReceipts.idempotencyKey, change.key)).limit(1);
  if (receipt) {
    if (receipt.userId !== userId) throw new AppError(409, 'key_taken', 'That change key was already used.');
    return { kind: 'duplicate' };
  }
  if (change.table === 'trips' && change.op === 'put') {
    const check = tripPayload.safeParse(change.payload);
    if (!check.success) throw new AppError(400, 'invalid_input', check.error.issues[0]?.message ?? 'That trip is missing details.');
  }

  const where = and(eq(s.userRecords.userId, userId), eq(s.userRecords.tbl, change.table), eq(s.userRecords.recordId, change.recordId));
  const [current] = await db.select().from(s.userRecords).where(where).limit(1);
  const serverRev = current?.rev ?? 0;
  // Someone else changed this record after this change was made: the device asks the traveller.
  if (!force && serverRev > change.baseRev) return { kind: 'conflict', serverRev, serverPayload: current?.deleted ? undefined : current?.payload };

  const rev = serverRev + 1;
  const deleted = change.op === 'delete';
  const payload = deleted ? null : (change.payload as object);
  await db
    .insert(s.userRecords)
    .values({ userId, tbl: change.table, recordId: change.recordId, payload, rev, deleted })
    .onConflictDoUpdate({ target: [s.userRecords.userId, s.userRecords.tbl, s.userRecords.recordId], set: { payload, rev, deleted, updatedAt: new Date() } });
  if (change.table === 'trips') await mirrorTrip(db, userId, change.op, change.recordId, change.payload);
  const result: PushResult = { kind: 'applied', rev };
  await db.insert(s.syncReceipts).values({ idempotencyKey: change.key, userId, result }).onConflictDoNothing();
  return result;
}

trips.post('/sync/push', async (c) => {
  const change = await jsonBody(c, pushBody);
  return c.json(await applyChange(c.get('userId'), change));
});

trips.get('/sync/pull', async (c) => {
  const { db } = await getDb();
  const rows = await db
    .select({ table: s.userRecords.tbl, recordId: s.userRecords.recordId, payload: s.userRecords.payload, rev: s.userRecords.rev, deleted: s.userRecords.deleted })
    .from(s.userRecords)
    .where(eq(s.userRecords.userId, c.get('userId')));
  return c.json({ records: rows });
});

/** Judge Mode: pretend another device edited a record, so the next push from this one conflicts. */
trips.post('/sync/simulate-remote-edit', async (c) => {
  const body = await jsonBody(c, z.object({ table: z.enum(SYNC_TABLES), recordId: z.string().min(1).max(120), payload: z.unknown() }));
  const result = await applyChange(c.get('userId'), { ...body, key: `remote-${crypto.randomUUID()}`, op: 'put', baseRev: 0 }, true);
  return c.json(result);
});

// ---------- Drafts ----------

const draftBody = z.object({
  id: z.string().uuid().optional(),
  step: z.string().max(40).default('details'),
  data: z.record(z.string().max(40), z.unknown()).refine((d) => JSON.stringify(d).length < 20_000, 'Draft is too large.'),
  version: z.number().int().min(0).default(0),
});

trips.get('/trips/draft', async (c) => {
  const { db } = await getDb();
  const [draft] = await db.select().from(s.tripDrafts).where(eq(s.tripDrafts.userId, c.get('userId'))).orderBy(desc(s.tripDrafts.updatedAt)).limit(1);
  return c.json({ draft: draft ?? null });
});

trips.put('/trips/draft', async (c) => {
  const body = await jsonBody(c, draftBody);
  const userId = c.get('userId');
  const { db } = await getDb();
  if (!body.id) {
    const [draft] = await db.insert(s.tripDrafts).values({ userId, step: body.step, data: body.data, version: 1 }).returning();
    return c.json({ draft }, 201);
  }
  const [current] = await db.select().from(s.tripDrafts).where(and(eq(s.tripDrafts.id, body.id), eq(s.tripDrafts.userId, userId))).limit(1);
  if (!current) throw new AppError(404, 'not_found', 'That draft was already used or deleted.');
  // Another tab or device saved a newer version: send it back instead of overwriting.
  if (body.version && current.version > body.version) return c.json({ error: { code: 'stale_draft', message: 'This draft changed on another device.' }, draft: current }, 409);
  const [draft] = await db
    .update(s.tripDrafts)
    .set({ step: body.step, data: body.data, version: current.version + 1, updatedAt: new Date() })
    .where(eq(s.tripDrafts.id, body.id))
    .returning();
  return c.json({ draft });
});

trips.delete('/trips/draft/:id', async (c) => {
  const id = z.string().uuid().safeParse(c.req.param('id'));
  if (id.success) {
    const { db } = await getDb();
    await db.delete(s.tripDrafts).where(and(eq(s.tripDrafts.id, id.data), eq(s.tripDrafts.userId, c.get('userId'))));
  }
  return c.json({ ok: true });
});

trips.get('/trips', async (c) => {
  const { db } = await getDb();
  const rows = await db.select().from(s.trips).where(eq(s.trips.userId, c.get('userId'))).orderBy(desc(s.trips.startDate));
  return c.json({ trips: rows });
});
