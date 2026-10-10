import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb, schema as s } from './db/client';
import { AppError } from './http';

// Sessions: a random token in an httpOnly cookie; the database keeps only its hash,
// so a leaked database cannot be used to log in.

export const SESSION_COOKIE = 'voyage_session';
const SESSION_DAYS = 30;
const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Email (lower-cased) or Indian mobile (+91 and 10 digits). Null if neither. */
export function normaliseContact(raw: string): { kind: 'email' | 'phone'; value: string } | null {
  const v = raw.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { kind: 'email', value: v.toLowerCase() };
  const digits = v.replace(/[\s()-]/g, '').replace(/^\+?91/, '').replace(/^0/, '');
  if (/^[6-9]\d{9}$/.test(digits)) return { kind: 'phone', value: `+91${digits}` };
  return null;
}

export function contactOrThrow(raw: string) {
  const c = normaliseContact(raw);
  if (!c) throw new AppError(400, 'invalid_input', 'Enter a valid email or 10-digit mobile number.', { contact: 'Enter a valid email or 10-digit mobile number.' });
  return c;
}

export async function findUserByContact(contact: { kind: 'email' | 'phone'; value: string }) {
  const { db } = await getDb();
  const col = contact.kind === 'email' ? s.users.email : s.users.phone;
  const [user] = await db.select().from(s.users).where(eq(col, contact.value)).limit(1);
  return user ?? null;
}

// ---------- Sessions ----------

export async function startSession(c: Context, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const { db } = await getDb();
  await db.insert(s.sessions).values({ id: sha256(token), userId, userAgent: c.req.header('user-agent')?.slice(0, 200), expiresAt });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
    path: '/',
    expires: expiresAt,
  });
}

export async function endSession(c: Context) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const { db } = await getDb();
    await db.update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.id, sha256(token)));
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function sessionUserId(c: Context): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const { db } = await getDb();
  const [row] = await db
    .select({ userId: s.sessions.userId })
    .from(s.sessions)
    .where(and(eq(s.sessions.id, sha256(token)), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, new Date())))
    .limit(1);
  return row?.userId ?? null;
}

/** Route guard: sets c.var.userId, or answers 401. */
export const requireUser: MiddlewareHandler<{ Variables: { userId: string } }> = async (c, next) => {
  const userId = await sessionUserId(c);
  if (!userId) throw new AppError(401, 'unauthenticated', 'Please log in to continue.');
  c.set('userId', userId);
  await next();
};

// ---------- One-time codes ----------

export type OtpPurpose = 'signup' | 'login' | 'reset';

/** Creates a 6-digit code and returns it (for delivery). Older codes for the same purpose stop working. */
export async function issueOtp(contact: string, purpose: OtpPurpose) {
  const { db } = await getDb();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.update(s.otpCodes).set({ usedAt: new Date() }).where(and(eq(s.otpCodes.contact, contact), eq(s.otpCodes.purpose, purpose), isNull(s.otpCodes.usedAt)));
  await db.insert(s.otpCodes).values({ contact, purpose, codeHash: sha256(`${contact}:${code}`), expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000) });
  return code;
}

/** Checks a code. `consume` marks it used. Wrong guesses count towards a limit. */
export async function checkOtp(contact: string, purpose: OtpPurpose, code: string, consume: boolean) {
  const { db } = await getDb();
  const [row] = await db
    .select()
    .from(s.otpCodes)
    .where(and(eq(s.otpCodes.contact, contact), eq(s.otpCodes.purpose, purpose), isNull(s.otpCodes.usedAt), gt(s.otpCodes.expiresAt, new Date())))
    .limit(1);
  const fail = (msg: string) => new AppError(400, 'bad_code', msg, { code: msg });
  if (!row) throw fail('That code has expired. Ask for a new one.');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw fail('Too many wrong tries. Ask for a new code.');
  const a = Buffer.from(sha256(`${contact}:${code}`));
  const b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.update(s.otpCodes).set({ attempts: row.attempts + 1 }).where(eq(s.otpCodes.id, row.id));
    throw fail('That code does not match.');
  }
  if (consume) await db.update(s.otpCodes).set({ usedAt: new Date() }).where(eq(s.otpCodes.id, row.id));
}

/**
 * Delivers a code by email or SMS. No email/SMS provider is connected yet, so it
 * reports `delivered: false` and the API returns the code to show on screen
 * (clearly labelled). Set OTP_SHOW_CODE=off once a provider is connected.
 */
export async function deliverOtp(_contact: { kind: 'email' | 'phone'; value: string }, code: string) {
  const showOnScreen = process.env.OTP_SHOW_CODE !== 'off';
  return { delivered: false, devCode: showOnScreen ? code : undefined };
}
