// Finds sensitive fields in a page's text (from a PDF text layer or OCR) and returns the boxes
// to black out. Strict patterns first; Aadhaar numbers must pass the Verhoeff checksum, and only
// their first 8 digits are covered (the last 4 stay visible, as on an official masked Aadhaar).
// Used in the browser to make the masked copy and on the server to double-check uploads.

export interface TextItem {
  text: string;
  x: number; // left, in page pixels
  y: number; // top
  w: number;
  h: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: SensitiveKind;
}
export type SensitiveKind = 'aadhaar' | 'pan' | 'passport' | 'driving_licence' | 'dob' | 'address' | 'mrz';

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeff(num: string) {
  let c = 0;
  const digits = num.replace(/\D/g, '').split('').reverse().map(Number);
  digits.forEach((d, i) => (c = D[c][P[i % 8][d]]));
  return c === 0;
}

interface Pattern {
  kind: SensitiveKind;
  re: RegExp;
  /** Which part of the match to cover: [start, end) relative to the match. Default: all. */
  cover?: (m: string) => [number, number];
  check?: (m: string) => boolean;
}

const firstEightDigits = (m: string): [number, number] => {
  let seen = 0;
  for (let i = 0; i < m.length; i++) if (/\d/.test(m[i]) && ++seen === 8) return [0, i + 1];
  return [0, m.length];
};

const PATTERNS: Pattern[] = [
  { kind: 'aadhaar', re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g, check: (m) => verhoeff(m), cover: firstEightDigits },
  { kind: 'pan', re: /\b[A-Z]{3}[ABCFGHLJPT][A-Z] ?\d{4} ?[A-Z]\b/g }, // OCR may split it
  { kind: 'passport', re: /\b[A-PR-WY][1-9]\d ?\d{4}[1-9]\b/g },
  { kind: 'driving_licence', re: /\b[A-Z]{2}[ -]?\d{2}[ -]?(?:19|20)\d{2}[ -]?\d{7}\b/g },
  { kind: 'mrz', re: /^[A-Z0-9<]{30,44}$/g, check: (m) => m.includes('<<') },
];
const DOB_LABEL = /\b(DOB|D\.O\.B|Date of Birth|Birth ?Date|Year of Birth|YoB)\b|जन्म/i;
const DATE = /\b(\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}|(?:19|20)\d{2}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2} [A-Za-z]{3,9} (?:19|20)\d{2})\b/g;
const YEAR = /\b(?:19|20)\d{2}\b/g;
const ADDRESS_LABEL = /^\s*(Address|Addr|Permanent Address|Residential Address|पता)\b[:\s]*/i;
const PIN = /\b[1-9]\d{2} ?\d{3}\b/;

interface Line {
  text: string;
  spans: { item: TextItem; start: number; end: number }[];
  y: number;
  h: number;
}

/** Group items into reading lines (same baseline band), left to right. */
export function toLines(items: TextItem[]): Line[] {
  const sorted = items.filter((i) => i.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { items: TextItem[]; y: number; h: number }[] = [];
  for (const it of sorted) {
    const mid = it.y + it.h / 2;
    const line = lines.find((l) => Math.abs(l.y + l.h / 2 - mid) < Math.max(l.h, it.h) * 0.5);
    if (line) line.items.push(it);
    else lines.push({ items: [it], y: it.y, h: it.h });
  }
  return lines.map((l) => {
    const spans: Line['spans'] = [];
    let text = '';
    for (const item of l.items.sort((a, b) => a.x - b.x)) {
      if (text) text += ' ';
      spans.push({ item, start: text.length, end: text.length + item.text.length });
      text += item.text;
    }
    return { text, spans, y: l.y, h: l.h };
  });
}

/** Boxes covering characters [start, end) of a line (proportional width inside each item). */
function boxesFor(line: Line, start: number, end: number, kind: SensitiveKind): Box[] {
  const out: Box[] = [];
  for (const sp of line.spans) {
    const a = Math.max(start, sp.start);
    const b = Math.min(end, sp.end);
    if (a >= b) continue;
    const per = sp.item.w / Math.max(1, sp.item.text.length);
    out.push({ x: sp.item.x + (a - sp.start) * per, y: sp.item.y, w: (b - a) * per, h: sp.item.h, kind });
  }
  return out;
}

export interface Findings {
  boxes: Box[];
  counts: Partial<Record<SensitiveKind, number>>;
}

export function findSensitive(items: TextItem[]): Findings {
  const lines = toLines(items);
  const boxes: Box[] = [];
  const counts: Findings['counts'] = {};
  const hit = (kind: SensitiveKind, line: Line, start: number, end: number) => {
    boxes.push(...boxesFor(line, start, end, kind));
    counts[kind] = (counts[kind] ?? 0) + 1;
  };

  lines.forEach((line, li) => {
    const compact = line.text.replace(/\s+/g, '');
    for (const p of PATTERNS) {
      const subject = p.kind === 'mrz' ? compact : line.text;
      for (const m of subject.matchAll(p.re)) {
        if (p.check && !p.check(m[0])) continue;
        if (p.kind === 'mrz') {
          hit('mrz', line, 0, line.text.length);
          continue;
        }
        const [a, b] = p.cover ? p.cover(m[0]) : [0, m[0].length];
        hit(p.kind, line, m.index! + a, m.index! + b);
      }
    }
    // Date of birth: dates (or a bare year) on a line that says DOB / Year of Birth.
    if (DOB_LABEL.test(line.text)) {
      const dates = [...line.text.matchAll(DATE)];
      const found = dates.length ? dates : /year of birth|yob/i.test(line.text) ? [...line.text.matchAll(YEAR)] : [];
      for (const m of found) hit('dob', line, m.index!, m.index! + m[0].length);
    }
    // Address: the label's line and the following lines up to the PIN code (max 4 lines).
    const label = line.text.match(ADDRESS_LABEL);
    if (label) {
      hit('address', line, label[0].length, line.text.length);
      for (let k = li + 1; k < Math.min(lines.length, li + 5); k++) {
        const next = lines[k];
        if (next.y - (lines[k - 1].y + lines[k - 1].h) > lines[k - 1].h * 1.5) break; // a gap ends the block
        boxes.push(...boxesFor(next, 0, next.text.length, 'address'));
        if (PIN.test(next.text)) break;
      }
    }
  });
  return { boxes, counts };
}

/** Quick check for raw text (e.g. extracted from an uploaded "masked" file). */
export function containsSensitive(text: string) {
  const items = text.split(/\n/).map((t, i) => ({ text: t, x: 0, y: i * 20, w: t.length * 8, h: 16 }));
  return Object.keys(findSensitive(items).counts).length > 0;
}

export const KIND_LABEL: Record<SensitiveKind, string> = {
  aadhaar: 'Aadhaar number (first 8 digits)',
  pan: 'PAN',
  passport: 'Passport number',
  driving_licence: 'Driving licence number',
  dob: 'Date of birth',
  address: 'Address',
  mrz: 'Passport machine-readable lines',
};
