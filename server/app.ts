import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { count } from 'drizzle-orm';
import { getDb, schema as s } from './db/client';
import { ensureSeeded } from './seed/seed';
import { errorBody, rateLimit } from './http';
import { catalog } from './routes/catalog';
import { auth } from './routes/auth';
import { trips } from './routes/trips';
import { live } from './routes/live';
import { flights } from './routes/flights';
import { hotels } from './routes/hotels';
import { documents } from './routes/documents';
import { assistant } from './routes/assistant';
import { guide } from './routes/guide';
import { budget } from './routes/budget';
import { payments } from './routes/payments';
import { cancellations } from './routes/cancellations';
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
app.use('/fx', rateLimit('catalog', 120, 60_000));
app.route('/', live); // before catalog, so /destinations/:slug/weather is matched
app.use('/transport/*', rateLimit('catalog', 120, 60_000));
app.route('/', guide);
app.use('/budget/*', rateLimit('search', 60, 60_000));
app.route('/', budget);
app.use('/payments/*', rateLimit('payments', 30, 60_000));
app.use('/cancellations/*', rateLimit('refunds', 40, 60_000));
app.route('/', payments);
app.route('/', cancellations);
app.route('/', catalog);

// Accounts. Tight limit on anything that checks a password or a code.
app.use('/auth/*', rateLimit('auth', 20, 60_000));
app.route('/', auth);

app.use('/flights/*', rateLimit('flights', 30, 60_000));
app.route('/', flights);
app.use('/hotels/*', rateLimit('hotels', 30, 60_000));
app.route('/', hotels);
app.use('/documents/*', rateLimit('documents', 60, 60_000));
app.use('/files/*', rateLimit('files', 120, 60_000));
app.route('/', documents);
app.use('/assistant/chat', rateLimit('chat', 20, 60_000));
app.use('/assistant/parse-booking', rateLimit('parse', 10, 60_000));
app.route('/', assistant);

// The traveller's trips, drafts and offline changes.
app.use('/sync/*', rateLimit('sync', 300, 60_000));
app.use('/trips/*', rateLimit('trips', 120, 60_000));
app.route('/', trips);

// AI wording, translation and intent (short, guarded tasks).
app.post('/ai', rateLimit('ai', 30, 60_000), async (c) => {
  let body: unknown = null;
  try {
    body = await c.req.json();
  } catch {
    /* handled as a bad request */
  }
  const out = await handleAi(body, { GROQ_API_KEY: process.env.GROQ_API_KEY, GROQ_MODEL: process.env.GROQ_MODEL, XAI_API_KEY: process.env.XAI_API_KEY, XAI_MODEL: process.env.XAI_MODEL });
  return c.json(out.json as object, out.status as 200);
});
