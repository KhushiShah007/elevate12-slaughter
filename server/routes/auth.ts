import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, jsonBody } from '../http';
import { checkOtp, contactOrThrow, deliverOtp, endSession, findUserByContact, issueOtp, requireUser, startSession } from '../auth';
import { derivePersona, type Answers, type Notes } from '../../src/engines/persona';

// Accounts: sign up (code + password), log in (password or code), forgot password,
// log out, and the signed-in traveller's profile.

export const auth = new Hono<{ Variables: { userId: string } }>();

const contact = z.string().trim().min(3).max(120);
const password = z.string().min(8, 'Use at least 8 characters.').max(200);
const code = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.');

/** Profile as the app sees it. */
export async function loadMe(userId: string) {
  const { db } = await getDb();
  const [row] = await db
    .select({ user: s.users, profile: s.profiles })
    .from(s.users)
    .leftJoin(s.profiles, eq(s.profiles.userId, s.users.id))
    .where(eq(s.users.id, userId))
    .limit(1);
  if (!row) throw new AppError(401, 'unauthenticated', 'Please log in to continue.');
  const { user, profile } = row;
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    contact: user.email ?? user.phone ?? '',
    name: profile?.name ?? 'Traveller',
    homeCity: profile?.homeCity ?? null,
    language: profile?.language ?? 'en',
    seniorMode: profile?.seniorMode ?? false,
    personaId: profile?.personaId ?? null,
    personaAnswers: profile?.personaAnswers ?? null,
    personaNotes: profile?.personaNotes ?? null,
  };
}

auth.post('/auth/otp', async (c) => {
  const body = await jsonBody(c, z.object({ contact, purpose: z.enum(['signup', 'login', 'reset']) }));
  const who = contactOrThrow(body.contact);
  const existing = await findUserByContact(who);
  if (body.purpose === 'signup' && existing) throw new AppError(409, 'account_exists', 'An account already uses this. Log in instead.', { contact: 'An account already uses this. Log in instead.' });
  if (body.purpose !== 'signup' && !existing) throw new AppError(404, 'no_account', 'No account uses this yet. Create one instead.', { contact: 'No account uses this yet. Create one instead.' });
  const otp = await issueOtp(who.value, body.purpose);
  const delivery = await deliverOtp(who, otp);
  return c.json({ ok: true, contact: who.value, ...delivery });
});

/** Checks a sign-up code without using it up, so the next step can ask for a password. */
auth.post('/auth/otp/check', async (c) => {
  const body = await jsonBody(c, z.object({ contact, purpose: z.enum(['signup', 'reset']), code }));
  await checkOtp(contactOrThrow(body.contact).value, body.purpose, body.code, false);
  return c.json({ ok: true });
});

auth.post('/auth/signup', async (c) => {
  const body = await jsonBody(c, z.object({ name: z.string().trim().min(2).max(60), contact, code, password }));
  const who = contactOrThrow(body.contact);
  if (await findUserByContact(who)) throw new AppError(409, 'account_exists', 'An account already uses this. Log in instead.');
  await checkOtp(who.value, 'signup', body.code, true);
  const { db } = await getDb();
  const passwordHash = await bcrypt.hash(body.password, 10);
  const [user] = await db
    .insert(s.users)
    .values({ email: who.kind === 'email' ? who.value : null, phone: who.kind === 'phone' ? who.value : null, passwordHash, contactVerified: true })
    .returning({ id: s.users.id });
  await db.insert(s.profiles).values({ userId: user.id, name: body.name, phone: who.kind === 'phone' ? who.value : null });
  await startSession(c, user.id);
  return c.json({ me: await loadMe(user.id) }, 201);
});

auth.post('/auth/login', async (c) => {
  const body = await jsonBody(c, z.object({ contact, password: z.string().min(1).max(200) }));
  const user = await findUserByContact(contactOrThrow(body.contact));
  // Same message either way, so the form does not reveal who has an account.
  const ok = user?.passwordHash ? await bcrypt.compare(body.password, user.passwordHash) : false;
  if (!user || !ok) throw new AppError(401, 'bad_credentials', 'That email/number and password do not match.');
  await startSession(c, user.id);
  return c.json({ me: await loadMe(user.id) });
});

auth.post('/auth/login-code', async (c) => {
  const body = await jsonBody(c, z.object({ contact, code }));
  const who = contactOrThrow(body.contact);
  const user = await findUserByContact(who);
  if (!user) throw new AppError(404, 'no_account', 'No account uses this yet.');
  await checkOtp(who.value, 'login', body.code, true);
  await startSession(c, user.id);
  return c.json({ me: await loadMe(user.id) });
});

auth.post('/auth/reset', async (c) => {
  const body = await jsonBody(c, z.object({ contact, code, password }));
  const who = contactOrThrow(body.contact);
  const user = await findUserByContact(who);
  if (!user) throw new AppError(404, 'no_account', 'No account uses this yet.');
  await checkOtp(who.value, 'reset', body.code, true);
  const { db } = await getDb();
  await db.update(s.users).set({ passwordHash: await bcrypt.hash(body.password, 10) }).where(eq(s.users.id, user.id));
  // Log out every other device, then sign this one in.
  await db.update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.userId, user.id));
  await startSession(c, user.id);
  return c.json({ me: await loadMe(user.id) });
});

auth.post('/auth/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

auth.get('/me', requireUser, async (c) => c.json({ me: await loadMe(c.get('userId')) }));

const answerMap = z.record(z.string().max(40), z.string().max(300)).optional();
auth.patch('/me', requireUser, async (c) => {
  const body = await jsonBody(
    c,
    z.object({
      name: z.string().trim().min(2).max(60).optional(),
      homeCity: z.string().trim().max(60).nullable().optional(),
      language: z.enum(['en', 'hi', 'hinglish', 'mr', 'ta', 'bn']).optional(),
      seniorMode: z.boolean().optional(),
      personaAnswers: answerMap,
      personaNotes: answerMap,
    }),
  );
  const userId = c.get('userId');
  const { db } = await getDb();
  const patch: Partial<typeof s.profiles.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.homeCity !== undefined) patch.homeCity = body.homeCity;
  if (body.language !== undefined) patch.language = body.language;
  if (body.seniorMode !== undefined) patch.seniorMode = body.seniorMode;
  if (body.personaAnswers) {
    // The persona is worked out on the server from the answers, so every device agrees.
    patch.personaAnswers = body.personaAnswers;
    patch.personaNotes = body.personaNotes ?? {};
    patch.personaId = derivePersona(body.personaAnswers as Answers, (body.personaNotes ?? {}) as Notes).id;
  }
  await db
    .insert(s.profiles)
    .values({ userId, name: body.name ?? 'Traveller', ...patch })
    .onConflictDoUpdate({ target: s.profiles.userId, set: patch });
  return c.json({ me: await loadMe(userId) });
});
