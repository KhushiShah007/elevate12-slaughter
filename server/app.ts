import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { count } from 'drizzle-orm';
import { getDb, schema as s } from './db/client';
import { ensureSeeded } from './seed/seed';
import { errorBody, rateLimit } from './http';
import { catalog } from './routes/catalog';
import { handleAi } from '../api/_ai';

// The Voyage API. Runs inside `npm run dev` (Vite middleware) and on Vercel (api/index.ts).

export const app = new Hono().basePath('/api');

app.use('*', secureHeaders());
app.use('*', async (c, next) => {
  c.header('cache-control', 'no-store');
  await next();
});

// First request on an empty database loads the seed data.
let seeded: Promise<unknown> | null = null;
app.use('*', async (_c, next) => {
  seeded ??= getDb().then(({ db }) => ensureSeeded(db));
  await seeded;
  await next();
});

app.onError((err, c) => {
  const { status, body } = errorBody(err);
  return c.json(body, status);
});
app.notFound((c) => c.json({ error: { code: 'not_found', message: 'No such API route.' } }, 404));

app.get('/health', async (c) => {
  const { db, kind } = await getDb();
  const [[d], [a], [h]] = await Promise.all([
    db.select({ n: count() }).from(s.destinations),
    db.select({ n: count() }).from(s.airports),
    db.select({ n: count() }).from(s.hotelsCache),
  ]);
  return c.json({ ok: true, database: kind, counts: { destinations: d.n, airports: a.n, hotels: h.n } });
});

app.use('/destinations/*', rateLimit('catalog', 120, 60_000));
app.use('/airports', rateLimit('catalog', 120, 60_000));
app.route('/', catalog);

// AI wording, translation and intent (Groq today; Grok/xAI in Phase 11).
app.post('/ai', rateLimit('ai', 30, 60_000), async (c) => {
  let body: unknown = null;
  try {
    body = await c.req.json();
  } catch {
    /* handled as a bad request */
  }
  const out = await handleAi(body, { GROQ_API_KEY: process.env.GROQ_API_KEY, GROQ_MODEL: process.env.GROQ_MODEL });
  return c.json(out.json as object, out.status as 200);
});
