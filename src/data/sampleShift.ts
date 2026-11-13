// The bundled sample trips were written for October 2026. To keep the demo current, every
// sample date is moved forward by the same number of whole days when the device is seeded,
// so the Kyoto & Tokyo trip always starts about a week ahead. Times of day, time zones and
// the gaps between dates do not change, so connections, delays and rankings behave the same.

/** Start date of the Kyoto & Tokyo sample trip, as written in sampleTrips.ts. */
const ANCHOR_UTC = Date.UTC(2026, 9, 14);
/** How many days ahead of today the sample trip should start. */
export const SAMPLE_LEAD_DAYS = 7;
const DAY_MS = 86_400_000;

/** Whole days to add to every sample date so the sample trip starts SAMPLE_LEAD_DAYS from `now`. */
export function sampleShiftDays(now: Date = new Date()): number {
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((todayUtc - ANCHOR_UTC) / DAY_MS) + SAMPLE_LEAD_DAYS);
}

const DATE_AT_START = /^(\d{4})-(\d{2})-(\d{2})(?=$|T)/;

/** Move the date part of an ISO string ("2026-10-14" or "2026-10-14T06:10:00+05:30") by whole days. */
export function shiftIso(value: string, days: number): string {
  const m = DATE_AT_START.exec(value);
  if (!m || !days) return value;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + days * DAY_MS);
  const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return ymd + value.slice(m[0].length);
}

/** A copy of `value` with every ISO date string inside it moved by `days`. Other values are kept. */
export function shiftDates<T>(value: T, days: number): T {
  if (!days) return value;
  if (typeof value === 'string') return shiftIso(value, days) as T;
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shiftDates(v, days)])) as T;
  }
  return value;
}
