import { safeError } from './security';
import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode as StatusCode } from 'hono/utils/http-status';
import { z, type ZodTypeAny } from 'zod';

// Shared HTTP helpers: one error shape for every route, zod validation, rate limiting.

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export class AppError extends HTTPException {
  constructor(
    status: StatusCode,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(status, { message });
  }
}

export function errorBody(err: unknown): { status: StatusCode; body: ApiError } {
  if (err instanceof AppError) return { status: err.status, body: { error: { code: err.code, message: err.message, fields: err.fields } } };
  if (err instanceof HTTPException) return { status: err.status, body: { error: { code: 'http_error', message: err.message } } };
  // Never leak internals: log on the server, send a friendly message.
  console.error('[api] unexpected error', safeError(err));
  return { status: 500, body: { error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } } };
}

/** Parse and validate input; throws a 400 with per-field messages. */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
  throw new AppError(400, 'invalid_input', 'Please check the highlighted fields.', fields);
}

export async function jsonBody<T extends ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, 'invalid_json', 'The request body must be JSON.');
  }
  return parse(schema, raw);
}

/**
 * Simple fixed-window rate limit per client IP and bucket. In-memory: fine for one
 * server; on serverless each instance limits on its own (swap for Upstash Redis later).
 */
export function rateLimit(bucket: string, max: number, windowMs: number): MiddlewareHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) {
      c.header('retry-after', String(Math.ceil((h.reset - now) / 1000)));
      throw new AppError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.');
    }
    await next();
  };
}
