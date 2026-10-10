import { Hono } from 'hono';
import { z } from 'zod';
import { AppError, parse } from '../http';
import { requireUser } from '../auth';
import { nightsBetween, searchHotels } from '../hotels';

// GET /api/hotels/search?slug=jaipur&checkIn=2026-12-18&checkOut=2026-12-22&adults=2&rooms=1

export const hotels = new Hono<{ Variables: { userId: string } }>();

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.');
const query = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,60}$/, 'Pick a destination.'),
    checkIn: date.refine((d) => d >= new Date().toISOString().slice(0, 10), 'That date has passed.'),
    checkOut: date,
    adults: z.coerce.number().int().min(1).max(20).default(1),
    rooms: z.coerce.number().int().min(1).max(10).default(1),
  })
  .refine((q) => nightsBetween(q.checkIn, q.checkOut) >= 1, { message: 'Check-out must be after check-in.', path: ['checkOut'] })
  .refine((q) => nightsBetween(q.checkIn, q.checkOut) <= 30, { message: 'Search up to 30 nights at a time.', path: ['checkOut'] });

hotels.get('/hotels/search', requireUser, async (c) => {
  const q = parse(query, c.req.query());
  const result = await searchHotels(q);
  if (!result) throw new AppError(404, 'not_found', 'We could not find that destination.');
  return c.json(result);
});
