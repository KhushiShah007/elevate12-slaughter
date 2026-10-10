// Shared by the server (api/_ai.ts) and the browser (src/ai): AI may reword, never renumber.

/** Every number-like token in a string, e.g. "₹15,125", "08:35", "2". */
export const numbersIn = (s: string) => (s.match(/\d[\d,:.]*\d|\d/g) ?? []).map((n) => n.replace(/[.,]$/, '')).sort();

/** The AI may change words, never numbers: same numbers in, same numbers out. */
export function keepsNumbers(original: string, rewritten: string) {
  const a = numbersIn(original);
  const b = numbersIn(rewritten);
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/** Everything the assistant can do. Code maps an intent to a screen; AI only picks one. */
export const INTENTS = [
  'delay',
  'missed',
  'connecting',
  'layover',
  'preponed',
  'boardingPass',
  'documents',
  'nextFlight',
  'family',
  'budget',
  'hotel',
  'food',
  'itinerary',
  'points',
  'unknown',
] as const;
export type Intent = (typeof INTENTS)[number];

/** Target languages the server will translate into. */
export const TRANSLATE_LANGS = ['Hindi', 'Hinglish', 'Marathi', 'Tamil', 'Bengali'] as const;
