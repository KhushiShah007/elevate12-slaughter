// Browser side of AI calls. Only talks to our own /api/ai; the Groq key never leaves the server.

export const AI_TIMEOUT_MS = 6000;

export class AiUnavailable extends Error {}

/** POST to /api/ai with a hard time limit. Throws AiUnavailable on any failure. */
export async function callAi<T>(body: unknown, timeoutMs = AI_TIMEOUT_MS): Promise<T> {
  if (!navigator.onLine) throw new AiUnavailable('offline');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new AiUnavailable(`status ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    throw err instanceof AiUnavailable ? err : new AiUnavailable(String(err));
  } finally {
    clearTimeout(timer);
  }
}
