import type { Intent } from '../../api/_guard';
import { CONFIDENT_SCORE, matchIntent } from '../engines/intentMatcher';
import { callAi } from './client';
import { getCached, hash, setCached } from './cache';

export interface Understood {
  intent: Intent;
  minutes: number | null;
  source: 'device' | 'ai' | 'none';
}

/**
 * On-device keywords first (instant, offline). Only if they are not sure, and we are
 * online, ask Groq to pick an intent from the fixed list. Results are cached.
 */
export async function understand(text: string): Promise<Understood> {
  const local = matchIntent(text);
  if (local.score >= CONFIDENT_SCORE) return { intent: local.intent, minutes: local.minutes, source: 'device' };

  const key = `intent:v1:${hash(text.trim().toLowerCase())}`;
  const cached = await getCached(key);
  if (cached) {
    const c = JSON.parse(cached) as { intent: Intent; minutes: number | null };
    return { ...c, minutes: c.minutes ?? local.minutes, source: 'ai' };
  }

  try {
    const res = await callAi<{ intent: Intent; minutes: number | null }>({ task: 'intent', text });
    if (res.intent && res.intent !== 'unknown') {
      await setCached([{ key, value: JSON.stringify({ intent: res.intent, minutes: res.minutes }) }]);
      return { intent: res.intent, minutes: res.minutes ?? local.minutes, source: 'ai' };
    }
  } catch {
    // Offline, no key or timed out: fall through.
  }
  // A weak guess (one hint word) is worse than asking: say we are not sure.
  return { intent: 'unknown', minutes: null, source: 'none' };
}
