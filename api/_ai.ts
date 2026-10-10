// Server-side AI core. Runs on Vercel (api/ai.ts) and in the Vite dev server.
// The Groq key is read from the server environment and never sent to the browser.
// Files starting with "_" are not exposed as their own routes on Vercel.
//
// Rule for every task: code decides, AI only rewords, translates or picks from a fixed list.

import { INTENTS, TRANSLATE_LANGS, keepsNumbers, type Intent } from './_guard';

export { keepsNumbers };

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 8000;
const MAX_ITEMS = 20;
const MAX_TEXT = 400;

export interface AiEnv {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
}

interface Item {
  id: string;
  text: string;
}

export interface AiResult {
  status: number;
  json: unknown;
}

const REWORD = [
  'You rewrite short reasons shown under travel options in a calm, premium travel concierge app for Indian travellers.',
  'Rules:',
  '- Keep every number, price, time, flight number and name exactly as written.',
  '- Do not add facts, advice, options or opinions. Do not change the meaning.',
  '- Warm, plain English. At most 30 words per item. No emojis, no exclamation marks.',
  'Return only JSON: {"items":[{"id":"<same id>","text":"<rewritten>"}]} with the same ids.',
].join('\n');

const translatePrompt = (lang: string) =>
  [
    `Translate short travel-app messages into ${lang} for Indian travellers.`,
    lang === 'Hinglish'
      ? 'Hinglish means everyday Hindi written in Roman (English) letters, mixed with common English words, as people text in India.'
      : `Use the native script for ${lang}, in simple everyday words a traveller would use.`,
    'Rules:',
    '- Keep every number, time and price exactly as written, using the digits 0-9.',
    '- Keep flight numbers, airport codes, airline, hotel and place names unchanged.',
    '- Translate only. Do not add or remove information. Calm, polite tone.',
    'Return only JSON: {"items":[{"id":"<same id>","text":"<translated>"}]} with the same ids.',
  ].join('\n');

const INTENT_PROMPT = [
  'You classify one message from a traveller using a travel app. It may be in English, Hindi, Hinglish, Marathi, Tamil or Bengali.',
  `Pick exactly one intent from this list: ${INTENTS.join(', ')}.`,
  'Meanings: delay = flight is late; missed = missed a flight or connection; connecting = how to change planes;',
  'layover = what to do during a layover; preponed = flight moved earlier; boardingPass = show boarding pass;',
  'documents = passport, visa, tickets, wallet; nextFlight = when/what is my next flight or its status;',
  'family = share pickup or tell family; budget = cost or spending; hotel = where I am staying;',
  'food = restaurants or what to eat; itinerary = plan for the day; points = loyalty points; unknown = anything else.',
  'If the message says how late or early the flight is, give that as whole minutes, else null.',
  'Return only JSON: {"intent":"<one intent>","minutes":<number or null>}.',
].join('\n');

type Parsed =
  | { task: 'reword'; items: Item[] }
  | { task: 'translate'; items: Item[]; lang: (typeof TRANSLATE_LANGS)[number] }
  | { task: 'intent'; text: string };

function parseItems(items: unknown): Item[] | null {
  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) return null;
  const ok = items.every(
    (i) => i && typeof i.id === 'string' && i.id.length <= 60 && typeof i.text === 'string' && i.text.length > 0 && i.text.length <= MAX_TEXT,
  );
  return ok ? (items as Item[]).map(({ id, text }) => ({ id, text })) : null;
}

/** Strictly validate the request. Anything unexpected is rejected before any AI call. */
function parse(body: unknown): Parsed | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { task?: unknown; items?: unknown; lang?: unknown; text?: unknown };
  if (b.task === 'reword') {
    const items = parseItems(b.items);
    return items ? { task: 'reword', items } : null;
  }
  if (b.task === 'translate') {
    const items = parseItems(b.items);
    const lang = TRANSLATE_LANGS.find((l) => l === b.lang);
    return items && lang ? { task: 'translate', items, lang } : null;
  }
  if (b.task === 'intent' && typeof b.text === 'string' && b.text.trim() && b.text.length <= MAX_TEXT) {
    return { task: 'intent', text: b.text.trim() };
  }
  return null;
}

async function groq(env: AiEnv, system: string, user: string, maxTokens: number): Promise<{ content: string; model: string | null } | AiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) return { status: 502, json: { error: 'upstream', upstreamStatus: res.status } };
    const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    return { content: data.choices?.[0]?.message?.content ?? '{}', model: data.model ?? null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { status: aborted ? 504 : 502, json: { error: aborted ? 'timeout' : 'upstream' } };
  } finally {
    clearTimeout(timer);
  }
}

/** Keep only answers for real ids that leave every number untouched. */
function guardItems(asked: Item[], content: string) {
  const byId = new Map(asked.map((i) => [i.id, i.text]));
  const parsed = JSON.parse(content) as { items?: Item[] };
  return (parsed.items ?? [])
    .filter((r) => r && typeof r.text === 'string' && byId.has(r.id) && r.text.length <= MAX_TEXT * 2 && keepsNumbers(byId.get(r.id)!, r.text))
    .map(({ id, text }) => ({ id, text: text.trim() }));
}

export async function handleAi(body: unknown, env: AiEnv): Promise<AiResult> {
  const req = parse(body);
  if (!req) return { status: 400, json: { error: 'bad-request' } };
  if (!env.GROQ_API_KEY) return { status: 503, json: { error: 'not-configured' } };

  try {
    if (req.task === 'intent') {
      const out = await groq(env, INTENT_PROMPT, req.text, 60);
      if ('status' in out) return out;
      const parsed = JSON.parse(out.content) as { intent?: unknown; minutes?: unknown };
      const intent: Intent = INTENTS.find((i) => i === parsed.intent) ?? 'unknown';
      const m = typeof parsed.minutes === 'number' && Number.isFinite(parsed.minutes) ? Math.round(parsed.minutes) : null;
      return { status: 200, json: { intent, minutes: m !== null && m > 0 && m <= 1440 ? m : null, model: out.model } };
    }

    const system = req.task === 'reword' ? REWORD : translatePrompt(req.lang);
    const out = await groq(env, system, JSON.stringify({ items: req.items }), req.task === 'reword' ? 700 : 2000);
    if ('status' in out) return out;
    return { status: 200, json: { items: guardItems(req.items, out.content), model: out.model } };
  } catch {
    return { status: 502, json: { error: 'bad-upstream-json' } };
  }
}
