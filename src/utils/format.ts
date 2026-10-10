const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-IN');

export const inr = (n: number) => inrFmt.format(n);
export const num = (n: number) => numFmt.format(n);

/** Clock time as written in the ISO string, i.e. local time at that airport. */
export const clock = (iso: string) => iso.slice(11, 16);

/** "Wed, 14 Oct" from the date part of an ISO string, independent of device time zone. */
export function day(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export function range(startIso: string, endIso: string) {
  return `${day(startIso, { day: 'numeric', month: 'short' })} – ${day(endIso, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function duration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} m` : ''}` : `${m} m`;
}

export function greeting(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Device-local time for timestamps the app itself recorded (e.g. last sync). */
export const localTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
