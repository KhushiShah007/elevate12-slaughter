import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, parse } from '../http';
import { sessionUserId } from '../auth';
import { budgetCuts, cheapestDates, personaFrom, whereCanIGo } from '../budget';

// Budget-first planning endpoints. Everything is an estimate and says so.

export const budget = new Hono();

const style = z.enum(['shoestring', 'moderate', 'comfort', 'luxury']).default('moderate');
const iata = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter airport code.'));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

budget.get('/budget/where', async (c) => {
  const q = parse(
    z.object({
      budget: z.coerce.number().int().min(1000).max(100_000_000),
      origin: iata.default('BOM'),
      days: z.coerce.number().int().min(1).max(60).default(4),
      travellers: z.coerce.number().int().min(1).max(20).default(2),
      style,
      date: day.optional(),
    }),
    c.req.query(),
  );
  // The signed-in traveller's persona, for "best for you".
  let persona = null;
  const userId = await sessionUserId(c);
  if (userId) {
    const { db } = await getDb();
    const [p] = await db.select({ answers: s.profiles.personaAnswers }).from(s.profiles).where(eq(s.profiles.userId, userId)).limit(1);
    persona = personaFrom(p?.answers ?? null);
  }
  const daysAhead = q.date ? Math.max(0, Math.round((Date.parse(q.date) - Date.now()) / 86_400_000)) : 30;
  const out = await whereCanIGo(q.budget, { origin: q.origin, days: q.days, travellers: q.travellers, style: q.style, daysAhead }, persona);
  if (!out.origin) throw new AppError(400, 'invalid_input', 'Unknown home airport.', { origin: 'Pick your nearest airport.' });
  return c.json({ ...out, budget: q.budget, note: 'Estimated totals: return flights (distance model), stay, food, local travel, activities and a 5% buffer.' });
});

budget.get('/budget/dates', async (c) => {
  const q = parse(z.object({ origin: iata, dest: iata, date: day, travellers: z.coerce.number().int().min(1).max(20).default(1) }), c.req.query());
  const cal = await cheapestDates(q.origin, q.dest, q.date, q.travellers);
  if (!cal) throw new AppError(404, 'not_found', 'Unknown airport.');
  return c.json(cal);
});

budget.get('/budget/cuts', async (c) => {
  const q = parse(
    z.object({
      slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
      budget: z.coerce.number().int().min(1000),
      origin: iata.default('BOM'),
      days: z.coerce.number().int().min(1).max(60).default(4),
      travellers: z.coerce.number().int().min(1).max(20).default(2),
      style,
      date: day.optional(),
    }),
    c.req.query(),
  );
  const out = await budgetCuts(q.slug, q.budget, q);
  if (!out) throw new AppError(404, 'not_found', 'We could not find that destination.');
  return c.json(out);
});
