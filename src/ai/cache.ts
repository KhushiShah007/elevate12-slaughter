import { db } from '../db/db';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Short stable hash (FNV-1a) so cache keys don't store the full text. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export async function getCached(key: string): Promise<string | null> {
  try {
    const hit = await db.aiCache.get(key);
    if (!hit || Date.now() - Date.parse(hit.createdAt) > TTL_MS) return null;
    return hit.value;
  } catch {
    return null;
  }
}

export async function setCached(entries: { key: string; value: string }[]) {
  try {
    const createdAt = new Date().toISOString();
    await db.aiCache.bulkPut(entries.map((e) => ({ ...e, createdAt })));
  } catch {
    /* a cache that can't save is still a working app */
  }
}
