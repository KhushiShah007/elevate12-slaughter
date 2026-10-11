import { Hono } from 'hono';
import { eq, getTableColumns, getTableName } from 'drizzle-orm';
import { PgTable, type PgColumn } from 'drizzle-orm/pg-core';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, jsonBody } from '../http';
import { endSession, requireUser } from '../auth';

// "Your data": download everything the account holds, or delete the account for good.

export const account = new Hono<{ Variables: { userId: string } }>();
account.use('/account/*', requireUser);

/** Never exported: credentials and one-time codes. Files are listed, not included (open them in the wallet). */
const SKIP = new Set(['sessions', 'password_resets', 'otp_codes']);
const HIDDEN_COLUMNS = new Set(['passwordHash', 'iv', 'tag', 'data', 'googleSub']);

type AnyTable = PgTable<any>;
function userTables(): AnyTable[] {
  return (Object.values(s) as unknown[]).filter((t): t is AnyTable => {
    try {
      return t instanceof PgTable && 'userId' in getTableColumns(t) && !SKIP.has(getTableName(t));
    } catch {
      return false;
    }
  });
}
const userIdOf = (t: AnyTable) => (getTableColumns(t) as unknown as { userId: PgColumn }).userId;

account.get('/account/export', async (c) => {
  const userId = c.get('userId');
  const { db } = await getDb();
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), note: 'Everything Voyage stores for your account. Document files are not included: download them from your wallet.' };
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId)).limit(1);
  out.account = Object.fromEntries(Object.entries(user ?? {}).filter(([k]) => !HIDDEN_COLUMNS.has(k)));
  for (const t of userTables()) {
    const col = userIdOf(t);
    const rows = (await db.select().from(t).where(eq(col, userId))) as Record<string, unknown>[];
    out[getTableName(t)] = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !HIDDEN_COLUMNS.has(k))));
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="voyage-my-data-${new Date().toISOString().slice(0, 10)}.json"`, 'cache-control': 'no-store' },
  });
});

/** Delete the account and everything in it. Needs the password (if one is set) and typing DELETE. */
account.post('/account/delete', async (c) => {
  const userId = c.get('userId');
  const b = await jsonBody(c, z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm.' }) }), password: z.string().max(200).optional() }));
  const { db } = await getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'Account not found.');
  if (user.passwordHash && !(b.password && (await bcrypt.compare(b.password, user.passwordHash)))) {
    throw new AppError(403, 'wrong_password', 'That password is not right.', { password: 'That password is not right.' });
  }
  await endSession(c);
  // Rows linked by foreign key go with the user (ON DELETE CASCADE); then sweep tables without one.
  await db.delete(s.users).where(eq(s.users.id, userId));
  for (const t of userTables()) {
    const col = userIdOf(t);
    await db.delete(t).where(eq(col, userId));
  }
  return c.json({ ok: true });
});
