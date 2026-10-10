// Server-side AI core. Runs on Vercel (api/ai.ts) and in the Vite dev server.
// The Groq key is read from the server environment and never sent to the browser.
// Files starting with "_" are not exposed as their own routes on Vercel.

import { keepsNumbers } from './_guard';

export { keepsNumbers };

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 8000;
const MAX_ITEMS = 8;
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

const SYSTEM = [
  'You rewrite short reasons shown under travel options in a calm, premium travel concierge app for Indian travellers.',
  'Rules:',
  '- Keep every number, price, time, flight number and name exactly as written.',
  '- Do not add facts, advice, options or opinions. Do not change the meaning.',
  '- Warm, plain English. At most 30 words per item. No emojis, no exclamation marks.',
  'Return only JSON: {"items":[{"id":"<same id>","text":"<rewritten>"}]} with the same ids.',
].join('\n');

function parseItems(body: unknown): Item[] | null {
  if (!body || typeof body !== 'object') return null;
  const { task, items } = body as { task?: unknown; items?: unknown };
  if (task !== 'reword' || !Array.isArray(items) || !items.length || items.length > MAX_ITEMS) return null;
  const ok = items.every(
    (i) => i && typeof i.id === 'string' && i.id.length <= 40 && typeof i.text === 'string' && i.text.length > 0 && i.text.length <= MAX_TEXT,
  );
  return ok ? (items as Item[]).map(({ id, text }) => ({ id, text })) : null;
}

export async function handleAi(body: unknown, env: AiEnv): Promise<AiResult> {
  const items = parseItems(body);
  if (!items) return { status: 400, json: { error: 'bad-request' } };
  if (!env.GROQ_API_KEY) return { status: 503, json: { error: 'not-configured' } };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify({ items }) },
        ],
      }),
    });
    if (!res.ok) return { status: 502, json: { error: 'upstream', upstreamStatus: res.status } };

    const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as { items?: Item[] };
    const byId = new Map(items.map((i) => [i.id, i.text]));
    // Keep only rewrites that answer a real id and leave every number untouched.
    const out = (parsed.items ?? []).filter(
      (r) => r && typeof r.text === 'string' && byId.has(r.id) && r.text.length <= MAX_TEXT && keepsNumbers(byId.get(r.id)!, r.text),
    );
    return { status: 200, json: { items: out.map(({ id, text }) => ({ id, text: text.trim() })), model: data.model ?? null } };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { status: aborted ? 504 : 502, json: { error: aborted ? 'timeout' : 'upstream' } };
  } finally {
    clearTimeout(timer);
  }
}
