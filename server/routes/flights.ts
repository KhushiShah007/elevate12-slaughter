import { Hono } from 'hono';
import { z } from 'zod';
import { parse } from '../http';
import { requireUser } from '../auth';
import { amadeusProvider, searchFlights } from '../flights';

// GET /api/flights/search?from=BOM&to=JAI&date=2026-12-18&adults=2

export const flights = new Hono<{ Variables: { userId: string } }>();

const query = z.object({
  from: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter airport code.')),
  to: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter airport code.')),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')
    .refine((d) => d >= new Date().toISOString().slice(0, 10), 'That date has passed.'),
  adults: z.coerce.number().int().min(1).max(9).default(1),
});

flights.get('/flights/search', requireUser, async (c) => {
  const q = parse(query, c.req.query());
  if (q.from === q.to) return c.json({ error: { code: 'invalid_input', message: 'From and to are the same airport.', fields: { to: 'Pick a different airport.' } } }, 400);
  return c.json(await searchFlights(q));
});

flights.get('/flights/providers', (c) => c.json({ live: amadeusProvider.available() ? 'amadeus' : null, fallback: 'openflights' }));
