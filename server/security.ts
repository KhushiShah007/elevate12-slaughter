import type { MiddlewareHandler } from 'hono';

// Cross-cutting security checks for the API.

/** Server-to-server callbacks: they prove themselves with signatures or secrets instead of an Origin. */
const CALLBACKS = [/^\/api\/payments\/webhook/, /^\/api\/cancellations\/inbound\//, /^\/api\/notifications\/inbound\//, /^\/api\/cron\//, /^\/api\/whatsapp\/webhook/];

/**
 * CSRF guard: state-changing requests must come from this site. The session cookie is
 * SameSite=Lax already; this also blocks cross-site form posts and fetches that carry it.
 */
export const sameOriginOnly: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const path = new URL(c.req.url).pathname;
  if (CALLBACKS.some((re) => re.test(path))) return next();
  const origin = c.req.header('origin');
  const site = c.req.header('sec-fetch-site');
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? new URL(c.req.url).host;
  let ok = true;
  if (origin && origin !== 'null') {
    try {
      ok = new URL(origin).host === host;
    } catch {
      ok = false;
    }
  } else if (origin === 'null' || site === 'cross-site') ok = false;
  if (!ok) return c.json({ error: { code: 'forbidden', message: 'Cross-site requests are not allowed.' } }, 403);
  return next();
};

/** Hosts the server may fetch from. Anything else is refused (no fetching user-supplied URLs). */
const ALLOWED_HOSTS = [
  'api.open-meteo.com',
  'archive-api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'api.met.no',
  'open.er-api.com',
  'api.frankfurter.app',
  'api.frankfurter.dev',
  'overpass-api.de',
  'en.wikipedia.org',
  'commons.wikimedia.org',
  'api.wikimedia.org',
  'nominatim.openstreetmap.org',
  'router.project-osrm.org',
  'api.x.ai',
  'api.groq.com',
  'api.deepgram.com',
  'api.openai.com',
  'api.razorpay.com',
  'api.resend.com',
  'test.api.amadeus.com',
  'api.amadeus.com',
  'places.googleapis.com',
  'maps.googleapis.com',
  'www.numbeo.com',
  'aerodatabox.p.rapidapi.com',
  'api.aviationstack.com',
];

export function assertAllowedUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) throw new Error(`Blocked outbound request to ${u.hostname}`);
  return u;
}

/** Log an error without personal data: no SQL parameters, emails, phone numbers or tokens. */
export function safeError(err: unknown) {
  const e = err as { name?: string; message?: string; code?: string };
  return `${e?.name ?? 'Error'}${e?.code ? ` (${e.code})` : ''}: ${String(e?.message ?? err)
    .replace(/params:[\s\S]*$/i, 'params: [hidden]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[number]')
    .replace(/[a-z]+:\/\/[^\s"]+/gi, '[url]')
    .replace(/(bearer|token|key|secret|password)[=:\s]+\S+/gi, '$1 [hidden]')
    .slice(0, 400)}`;
}
