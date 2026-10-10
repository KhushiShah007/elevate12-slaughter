import { callAi } from './client';
import { getCached, hash, setCached } from './cache';
import { keepsNumbers } from '../../api/_guard';
import type { WordingSource } from './rewordOptions';

// Translates text the engines generate (cascade details, option reasons, timeline steps).
// Fixed UI strings live in src/i18n; this is only for sentences built from trip data.
// Saved translation -> fresh translation (online) -> English with a note.

const keyFor = (lang: string, text: string) => `tr:v1:${lang}:${hash(text)}`;

export interface Translated {
  texts: Record<string, string>;
  source: WordingSource; // 'template' here means some items are still in English
  complete: boolean; // every item translated
}

export async function translateTexts(items: { id: string; text: string }[], lang: string): Promise<Translated> {
  const texts: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, i.text]));
  const missing: { id: string; text: string }[] = [];
  let fromCache = false;

  for (const item of items) {
    const hit = await getCached(keyFor(lang, item.text));
    if (hit) {
      texts[item.id] = hit;
      fromCache = true;
    } else missing.push(item);
  }
  if (!missing.length) return { texts, source: 'cache', complete: true };

  let done = 0;
  try {
    // Unique texts only, in chunks the server accepts.
    const unique = [...new Map(missing.map((m) => [m.text, m])).values()];
    for (let i = 0; i < unique.length; i += 20) {
      const chunk = unique.slice(i, i + 20);
      const res = await callAi<{ items: { id: string; text: string }[] }>({ task: 'translate', lang, items: chunk });
      const saved: { key: string; value: string }[] = [];
      for (const r of res.items ?? []) {
        const original = chunk.find((c) => c.id === r.id);
        if (!original || !keepsNumbers(original.text, r.text)) continue;
        saved.push({ key: keyFor(lang, original.text), value: r.text });
        for (const m of missing) if (m.text === original.text) {
          texts[m.id] = r.text;
          done++;
        }
      }
      await setCached(saved);
    }
  } catch {
    // Offline, timed out, or no key: those items stay in English.
  }
  const complete = done === missing.length;
  return { texts, source: done ? 'ai' : fromCache ? 'cache' : 'template', complete };
}
