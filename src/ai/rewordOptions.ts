import { callAi } from './client';
import { getCached, hash, setCached } from './cache';
import { keepsNumbers } from '../../api/_guard';

// Code decides; AI only rewrites the wording of each option's reason.
// Order of preference: saved AI wording -> fresh AI wording (online) -> our own template.

export type WordingSource = 'ai' | 'cache' | 'template';

export interface Reworded {
  texts: Record<string, string>;
  source: WordingSource; // the best source used for any item
}

const keyFor = (text: string) => `reword:v1:${hash(text)}`;

export async function rewordReasons(items: { id: string; text: string }[]): Promise<Reworded> {
  const texts: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, i.text]));
  let source: WordingSource = 'template';

  const missing: { id: string; text: string }[] = [];
  for (const item of items) {
    const hit = await getCached(keyFor(item.text));
    if (hit) {
      texts[item.id] = hit;
      source = 'cache';
    } else missing.push(item);
  }
  if (!missing.length) return { texts, source };

  try {
    const res = await callAi<{ items: { id: string; text: string }[] }>({ task: 'reword', items: missing });
    const saved: { key: string; value: string }[] = [];
    for (const r of res.items ?? []) {
      const original = missing.find((m) => m.id === r.id);
      // Checked again here: never show a rewrite whose numbers differ from ours.
      if (!original || !keepsNumbers(original.text, r.text)) continue;
      texts[r.id] = r.text;
      saved.push({ key: keyFor(original.text), value: r.text });
    }
    if (saved.length) {
      source = 'ai';
      await setCached(saved);
    }
  } catch {
    // Offline, timed out, or no key configured: the template wording stays.
  }
  return { texts, source };
}
