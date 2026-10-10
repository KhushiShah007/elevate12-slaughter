import { inArray } from 'drizzle-orm';
import { getDb, schema as s } from '../db/client';
import { complete, type LlmProvider } from './llm';

// Read a pasted booking email or SMS. Two readers:
//  - rules: patterns for PNRs, flight numbers, airport codes, dates, times, amounts
//  - AI (when a key is set): better at messy emails
// Either way, every value must literally appear in the pasted text (dates and times
// after normalising), or it is dropped. Nothing is invented.

export interface ParsedBooking {
  kind: 'flight' | 'hotel' | 'unknown';
  airline: string | null;
  flightNo: string | null;
  from: string | null; // IATA
  to: string | null;
  departDate: string | null; // yyyy-mm-dd
  departTime: string | null; // HH:MM
  arriveDate: string | null;
  arriveTime: string | null;
  pnr: string | null;
  hotelName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  totalInr: number | null;
  travellers: number | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** All dates in the text, as yyyy-mm-dd, in order of appearance. */
export function datesIn(text: string): string[] {
  const found: { at: number; iso: string }[] = [];
  const add = (at: number, y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2100) found.push({ at, iso: `${y}-${pad(m)}-${pad(d)}` });
  };
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m.index!, +m[1], +m[2], +m[3]);
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) add(m.index!, +m[3], +m[2], +m[1]); // Indian day-first
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,\s]+'?(\d{2,4})\b/g)) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) add(m.index!, +m[3], mi + 1, +m[1]);
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) add(m.index!, +m[3], mi + 1, +m[2]);
  }
  return [...new Map(found.sort((a, b) => a.at - b.at).map((f) => [f.iso + f.at, f.iso])).values()];
}

/** All clock times as HH:MM (24 h), in order. */
export function timesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|hrs|h)?\b/gi)) {
    let h = +m[1];
    const min = +m[2];
    const ap = m[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h <= 23 && min <= 59) out.push(`${pad(h)}:${pad(min)}`);
  }
  return out;
}

const norm = (t: string) => t.toUpperCase().replace(/[\s-]/g, '');

/** Rule-based reader. Airport codes are checked against the airport table. */
export async function parseByRules(text: string): Promise<ParsedBooking> {
  const upper = text.toUpperCase();
  const pnr = upper.match(/\b(?:PNR|BOOKING\s*(?:REF(?:ERENCE)?|ID|CODE)|CONFIRMATION\s*(?:CODE|NO\.?|NUMBER)?)\s*[:#-]?\s*([A-Z0-9]{5,8})\b/)?.[1] ?? null;
  const flight = upper.match(/\bFLIGHT\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z0-9]{2})\s?-?(\d{2,4})\b/) ?? upper.match(/\b(6E|AI|SG|IX|QP|UK|EK|SQ|TG|QR|EY|LH|BA|AF|MH|CX|KL)\s?-?(\d{2,4})\b/);
  const candidates = [...new Set([...upper.matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]))].filter((c) => !['PNR', 'THE', 'AND', 'FOR', 'YOU', 'INR', 'TOTAL', 'NON', 'AIR', 'PAX'].includes(c));
  const { db } = await getDb();
  const known = candidates.length ? new Set((await db.select({ iata: s.airports.iata }).from(s.airports).where(inArray(s.airports.iata, candidates))).map((a) => a.iata)) : new Set<string>();
  const codes = candidates.filter((c) => known.has(c));
  const dates = datesIn(text);
  const times = timesIn(text);
  const amount = text.match(/(?:total|amount|fare|paid|grand total)[^\d₹]{0,25}(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d{1,2})?)/i) ?? text.match(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d{1,2})?)/i);
  const hotel = text.match(/\b((?:hotel|resort|inn|haveli|homestay|guest\s?house)[^\n,.]{2,50}|[^\n,.]{2,50}\s(?:hotel|resort|inn|palace))/i)?.[1]?.trim() ?? null;
  const isHotel = /check[\s-]?in/i.test(text) && /check[\s-]?out/i.test(text);
  const pax = text.match(/\b(\d{1,2})\s*(?:adults?|passengers?|travell?ers?|guests?|pax)\b/i);

  return {
    kind: isHotel ? 'hotel' : flight || codes.length >= 2 ? 'flight' : 'unknown',
    airline: null,
    flightNo: flight ? `${flight[1]} ${flight[2]}` : null,
    from: isHotel ? null : (codes[0] ?? null),
    to: isHotel ? null : (codes[1] ?? null),
    departDate: isHotel ? null : (dates[0] ?? null),
    departTime: isHotel ? null : (times[0] ?? null),
    arriveDate: isHotel ? null : (dates[1] ?? dates[0] ?? null),
    arriveTime: isHotel ? null : (times[1] ?? null),
    pnr,
    hotelName: isHotel ? hotel : null,
    checkIn: isHotel ? (dates[0] ?? null) : null,
    checkOut: isHotel ? (dates[1] ?? null) : null,
    totalInr: amount ? Math.round(Number(amount[1].replace(/,/g, ''))) : null,
    travellers: pax ? Number(pax[1]) : null,
  };
}

/** Drop any value that does not appear in the pasted text. */
export function groundBooking(b: ParsedBooking, text: string): ParsedBooking {
  const flat = norm(text);
  const dates = new Set(datesIn(text));
  const times = new Set(timesIn(text));
  const has = (v: string | null) => (v && flat.includes(norm(v)) ? v : null);
  const date = (v: string | null) => (v && dates.has(v) ? v : null);
  const time = (v: string | null) => (v && times.has(v) ? v : null);
  const amount = b.totalInr != null && text.replace(/,/g, '').includes(String(b.totalInr)) ? b.totalInr : null;
  const travellers = b.travellers != null && new RegExp(`\\b${b.travellers}\\b`).test(text) ? b.travellers : null;
  return {
    kind: b.kind,
    airline: has(b.airline),
    flightNo: has(b.flightNo),
    from: has(b.from),
    to: has(b.to),
    departDate: date(b.departDate),
    departTime: time(b.departTime),
    arriveDate: date(b.arriveDate),
    arriveTime: time(b.arriveTime),
    pnr: has(b.pnr),
    hotelName: has(b.hotelName),
    checkIn: date(b.checkIn),
    checkOut: date(b.checkOut),
    totalInr: amount,
    travellers,
  };
}

const PROMPT = [
  'Extract booking details from a pasted airline or hotel confirmation (email or SMS) for an Indian travel app.',
  'Return only JSON with these keys (null when not present in the text):',
  '{"kind":"flight"|"hotel"|"unknown","airline":string,"flightNo":string,"from":"3-letter IATA","to":"3-letter IATA",',
  '"departDate":"yyyy-mm-dd","departTime":"HH:MM 24h","arriveDate":"yyyy-mm-dd","arriveTime":"HH:MM 24h","pnr":string,',
  '"hotelName":string,"checkIn":"yyyy-mm-dd","checkOut":"yyyy-mm-dd","totalInr":number,"travellers":number}',
  'Copy codes, names and numbers exactly as written. Dates in Indian emails are day-first. Never guess: use null.',
].join('\n');

export async function parseBooking(text: string, p: LlmProvider | null): Promise<{ source: 'ai' | 'rules'; booking: ParsedBooking }> {
  const rules = groundBooking(await parseByRules(text), text);
  if (!p) return { source: 'rules', booking: rules };
  try {
    const out = await complete(p, [{ role: 'system', content: PROMPT }, { role: 'user', content: text }], { json: true, maxTokens: 400, temperature: 0 });
    const raw = JSON.parse(out.message.content ?? '{}') as Partial<ParsedBooking>;
    const ai = groundBooking(
      {
        kind: raw.kind === 'flight' || raw.kind === 'hotel' ? raw.kind : 'unknown',
        airline: raw.airline ?? null,
        flightNo: raw.flightNo ?? null,
        from: raw.from ?? null,
        to: raw.to ?? null,
        departDate: raw.departDate ?? null,
        departTime: raw.departTime ?? null,
        arriveDate: raw.arriveDate ?? null,
        arriveTime: raw.arriveTime ?? null,
        pnr: raw.pnr ?? null,
        hotelName: raw.hotelName ?? null,
        checkIn: raw.checkIn ?? null,
        checkOut: raw.checkOut ?? null,
        totalInr: typeof raw.totalInr === 'number' ? Math.round(raw.totalInr) : null,
        travellers: typeof raw.travellers === 'number' ? raw.travellers : null,
      },
      text,
    );
    // Fill anything the AI missed with what the rules found.
    const merged = Object.fromEntries(Object.entries(ai).map(([k, v]) => [k, v ?? (rules as unknown as Record<string, unknown>)[k]])) as unknown as ParsedBooking;
    return { source: 'ai', booking: { ...merged, kind: ai.kind !== 'unknown' ? ai.kind : rules.kind } };
  } catch {
    return { source: 'rules', booking: rules };
  }
}
