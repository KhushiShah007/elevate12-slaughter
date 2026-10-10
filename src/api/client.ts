// Browser side of the Voyage API. Same origin, session cookie sent automatically.
// Every failure becomes an ApiError with a message that is safe to show.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
  get offline() {
    return this.code === 'offline';
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  if (!navigator.onLine) throw new ApiError(0, 'offline', 'You are offline. Connect to the internet and try again.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'offline', 'Could not reach Voyage. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string; fields?: Record<string, string> } } | null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'server_error', e?.message ?? 'Something went wrong. Please try again.', e?.fields ?? {});
  }
  return data as T;
}

/** The signed-in traveller, as GET /api/me returns it. */
export interface Me {
  id: string;
  email: string | null;
  phone: string | null;
  contact: string;
  name: string;
  homeCity: string | null;
  language: 'en' | 'hi' | 'hinglish' | 'mr' | 'ta' | 'bn';
  seniorMode: boolean;
  personaId: string | null;
  personaAnswers: Record<string, string> | null;
  personaNotes: Record<string, string> | null;
}

export interface OtpSent {
  ok: true;
  contact: string;
  delivered: boolean;
  /** Present only while no email/SMS provider is connected. */
  devCode?: string;
}
