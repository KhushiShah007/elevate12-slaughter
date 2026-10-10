import fs from 'node:fs/promises';
import path from 'node:path';

// Shared helpers for the data pipelines: polite fetching with retries, caching raw
// downloads in .data/raw, and writing seed files to server/seed/data.

export const USER_AGENT = 'VoyageTravelApp/0.1 (hackathon prototype data pipeline)';
export const RAW_DIR = path.resolve(process.cwd(), '.data/raw');
export const SEED_DIR = path.resolve(process.cwd(), 'server/seed/data');

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a User-Agent, a timeout and exponential back-off on failure. */
export async function politeFetch(url: string, init: RequestInit = {}, tries = 5, timeoutMs = 60000): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/plain, */*', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      last = new Error(`${res.status} ${res.statusText}`);
      if (res.status !== 429 && res.status < 500) break; // client errors won't fix themselves
      if (res.status === 429) {
        // Rate limited: wait as long as the server asks (or back off hard).
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * 2 ** attempt);
        continue;
      }
    } catch (err) {
      last = err;
    }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error(`Failed to fetch ${url}: ${String(last)}`);
}

/** Download once and reuse the file on later runs. */
export async function cachedDownload(url: string, name: string): Promise<string> {
  const file = path.join(RAW_DIR, name);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    const text = await (await politeFetch(url)).text();
    await fs.mkdir(RAW_DIR, { recursive: true });
    await fs.writeFile(file, text);
    return text;
  }
}

export async function writeSeed(name: string, data: unknown) {
  await fs.mkdir(SEED_DIR, { recursive: true });
  const file = path.join(SEED_DIR, name);
  await fs.writeFile(file, JSON.stringify(data));
  const kb = Math.round((await fs.stat(file)).size / 1024);
  console.log(`wrote ${path.relative(process.cwd(), file)} (${kb} KB)`);
}

/** Minimal CSV line parser for the OpenFlights .dat files (quoted fields, \N = null). */
export function parseCsvLine(line: string): (string | null)[] {
  const out: (string | null)[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur === '\\N' ? null : cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur === '\\N' ? null : cur);
  return out;
}
