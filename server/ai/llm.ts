// One client for OpenAI-compatible chat APIs: Grok (xAI) first, Groq second.
// Keys stay on the server. Nothing here logs prompts or replies.

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface LlmTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmProvider {
  name: 'grok' | 'groq';
  model: string;
  url: string;
  key: string;
}

/** The configured provider, or null when no key is set. */
export function llmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider | null {
  if (env.XAI_API_KEY) return { name: 'grok', model: env.XAI_MODEL || 'grok-3-mini', url: 'https://api.x.ai/v1/chat/completions', key: env.XAI_API_KEY };
  if (env.GROQ_API_KEY) return { name: 'groq', model: env.GROQ_MODEL || 'llama-3.3-70b-versatile', url: 'https://api.groq.com/openai/v1/chat/completions', key: env.GROQ_API_KEY };
  return null;
}

export class LlmError extends Error {
  constructor(
    public kind: 'timeout' | 'upstream' | 'rate_limited',
    message: string,
  ) {
    super(message);
  }
}

export async function complete(
  p: LlmProvider,
  messages: LlmMessage[],
  opts: { tools?: LlmTool[]; json?: boolean; maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<{ message: LlmMessage; model: string }> {
  let res: Response;
  try {
    res = await fetch(p.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 700,
        ...(opts.tools ? { tools: opts.tools, tool_choice: 'auto' } : {}),
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    });
  } catch (err) {
    throw new LlmError(err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'upstream', 'AI service unreachable');
  }
  if (res.status === 429) throw new LlmError('rate_limited', 'AI service is busy');
  if (!res.ok) throw new LlmError('upstream', `AI service error ${res.status}`);
  const data = (await res.json()) as { model?: string; choices?: { message?: LlmMessage }[] };
  const message = data.choices?.[0]?.message;
  if (!message) throw new LlmError('upstream', 'Empty AI reply');
  return { message: { role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls }, model: data.model ?? p.model };
}
