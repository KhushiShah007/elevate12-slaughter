import type { Iso } from '../types';

// Times in Voyage are ISO strings with the local offset of the place they happen
// (e.g. Narita times end in +09:00). These helpers keep that offset intact.

export function minutesBetween(a: Iso, b: Iso): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 60000);
}

function offsetOf(iso: Iso): string {
  const m = iso.match(/([+-]\d{2}:\d{2}|Z)$/);
  return m ? m[1] : 'Z';
}

function offsetMinutes(offset: string): number {
  if (offset === 'Z') return 0;
  const sign = offset[0] === '-' ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return sign * (h * 60 + m);
}

/** Move a time by `minutes`, keeping its local offset. */
export function shift(iso: Iso, minutes: number, offset = offsetOf(iso)): Iso {
  const ms = Date.parse(iso) + minutes * 60000;
  const local = new Date(ms + offsetMinutes(offset) * 60000).toISOString().slice(0, 19);
  return `${local}${offset === 'Z' ? 'Z' : offset}`;
}

/** Express a moment in the offset of another time (e.g. "in Tokyo time"). */
export const inZoneOf = (iso: Iso, like: Iso) => shift(iso, 0, offsetOf(like));

export const isAfter = (a: Iso, b: Iso) => Date.parse(a) > Date.parse(b);

/** "HH:MM" local clock of an ISO time. */
export const hhmm = (iso: Iso) => iso.slice(11, 16);

/** "HH:MM" clock moved by minutes, for times stored as plain clock strings. */
export function shiftClock(clock: string, minutes: number): string {
  const [h, m] = clock.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "2 h 40 m", "50 m". */
export function span(min: number): string {
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return h ? `${h} h${m ? ` ${m} m` : ''}` : `${m} m`;
}
