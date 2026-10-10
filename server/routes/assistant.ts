import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, jsonBody, parse } from '../http';
import { requireUser } from '../auth';
import { llmProvider, LlmError, type LlmMessage } from '../ai/llm';
import { runChat, runChatStream, systemPrompt } from '../ai/chat';
import { answerByRules } from '../ai/rules';
import { streamSSE } from 'hono/streaming';
import { parseBooking } from '../ai/booking';
import type { ToolLink } from '../ai/tools';

// The assistant: chat with tools over the traveller's data, saved conversations,
// and reading pasted bookings.

export const assistant = new Hono<{ Variables: { userId: string } }>();
assistant.use('/assistant/*', requireUser);

assistant.get('/assistant/status', (c) => {
  const p = llmProvider();
  // provider null = no AI key: the built-in rules answer (never an error).
  return c.json({ provider: p?.name ?? null, model: p?.model ?? null, fallback: 'rules' });
});

const chatBody = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1, 'Type a message.').max(1000),
  lang: z.enum(['en', 'hi', 'hinglish', 'mr', 'ta', 'bn']).default('en'),
});

/** Open (or create) the conversation and load its history. */
async function conversation(userId: string, conversationId: string | undefined, firstMessage: string) {
  const { db } = await getDb();
  if (conversationId) {
    const [conv] = await db.select().from(s.chatConversations).where(and(eq(s.chatConversations.id, conversationId), eq(s.chatConversations.userId, userId))).limit(1);
    if (!conv) throw new AppError(404, 'not_found', 'That conversation was deleted.');
    const rows = await db.select().from(s.chatMessages).where(eq(s.chatMessages.conversationId, conversationId)).orderBy(asc(s.chatMessages.createdAt));
    return { id: conversationId, history: rows.filter((r) => r.role === 'user' || r.role === 'assistant').map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content })) as LlmMessage[] };
  }
  const [conv] = await db.insert(s.chatConversations).values({ userId, title: firstMessage.slice(0, 60) }).returning();
  return { id: conv.id, history: [] as LlmMessage[] };
}

async function systemFor(userId: string, lang: string) {
  const { db } = await getDb();
  const [profile] = await db.select({ name: s.profiles.name, personaId: s.profiles.personaId }).from(s.profiles).where(eq(s.profiles.userId, userId)).limit(1);
  return systemPrompt({ name: profile?.name ?? 'Traveller', persona: profile?.personaId ?? null, lang, today: new Date().toISOString().slice(0, 10) });
}

async function remember(conversationId: string, message: string, turn: { reply: string; links: ToolLink[]; toolsUsed: string[]; model: string }) {
  const { db } = await getDb();
  await db.insert(s.chatMessages).values([
    { conversationId, role: 'user', content: message },
    { conversationId, role: 'assistant', content: turn.reply, toolCalls: { links: turn.links, tools: turn.toolsUsed, model: turn.model } },
  ]);
  await db.update(s.chatConversations).set({ updatedAt: new Date() }).where(eq(s.chatConversations.id, conversationId));
}

/** One reply: the AI with tools when configured, else (or if it fails) the rule-based assistant. */
assistant.post('/assistant/chat', async (c) => {
  const body = await jsonBody(c, chatBody);
  const userId = c.get('userId');
  const conv = await conversation(userId, body.conversationId, body.message);
  const p = llmProvider();
  let provider: string = p?.name ?? 'rules';
  let turn: { reply: string; links: ToolLink[]; toolsUsed: string[]; model: string; grounded: boolean };
  let note: string | null = null;
  try {
    if (!p) throw new LlmError('upstream', 'no key');
    turn = (await runChat(p, userId, await systemFor(userId, body.lang), conv.history, body.message)).turn;
  } catch (err) {
    if (!(err instanceof LlmError)) throw err;
    // The bot never dies: answer with the rules (and say so when the AI was expected).
    const r = await answerByRules(userId, body.message);
    turn = { ...r, model: 'rules', grounded: true };
    if (p) note = err.kind === 'rate_limited' ? 'The AI is busy, so this answer comes from Voyage’s built-in rules.' : 'The AI did not answer, so this comes from Voyage’s built-in rules.';
    provider = 'rules';
  }
  await remember(conv.id, body.message, turn);
  return c.json({ conversationId: conv.id, reply: turn.reply, links: turn.links, provider, model: turn.model, grounded: turn.grounded, note });
});

/** Streamed reply (Server-Sent Events): tool, delta, replace, done. */
assistant.post('/assistant/chat/stream', async (c) => {
  const body = await jsonBody(c, chatBody);
  const userId = c.get('userId');
  const conv = await conversation(userId, body.conversationId, body.message);
  const p = llmProvider();
  return streamSSE(c, async (stream) => {
    const emit = (event: string, data: string) => stream.writeSSE({ event, data });
    let turn: { reply: string; links: ToolLink[]; toolsUsed: string[]; model: string; grounded: boolean };
    let provider: string = p?.name ?? 'rules';
    try {
      if (!p) throw new LlmError('upstream', 'no key');
      turn = await runChatStream(p, userId, await systemFor(userId, body.lang), conv.history, body.message, emit);
    } catch (err) {
      const r = await answerByRules(userId, body.message);
      turn = { ...r, model: 'rules', grounded: true };
      provider = 'rules';
      if (p && err instanceof LlmError) await emit('note', 'The AI did not answer, so this comes from Voyage’s built-in rules.');
      await emit('replace', r.reply);
    }
    await remember(conv.id, body.message, turn);
    await emit('done', JSON.stringify({ conversationId: conv.id, reply: turn.reply, links: turn.links, provider, grounded: turn.grounded }));
  });
});

/** Clear a chat. */
assistant.delete('/assistant/conversations', async (c) => {
  const { db } = await getDb();
  await db.delete(s.chatConversations).where(eq(s.chatConversations.userId, c.get('userId')));
  return c.json({ ok: true });
});

assistant.get('/assistant/conversations', async (c) => {
  const { db } = await getDb();
  const rows = await db
    .select({ id: s.chatConversations.id, title: s.chatConversations.title, updatedAt: s.chatConversations.updatedAt })
    .from(s.chatConversations)
    .where(eq(s.chatConversations.userId, c.get('userId')))
    .orderBy(desc(s.chatConversations.updatedAt))
    .limit(30);
  return c.json({ conversations: rows });
});

assistant.get('/assistant/conversations/:id', async (c) => {
  const id = parse(z.string().uuid(), c.req.param('id'));
  const { db } = await getDb();
  const [conv] = await db.select().from(s.chatConversations).where(and(eq(s.chatConversations.id, id), eq(s.chatConversations.userId, c.get('userId')))).limit(1);
  if (!conv) throw new AppError(404, 'not_found', 'That conversation was deleted.');
  const rows = await db.select().from(s.chatMessages).where(eq(s.chatMessages.conversationId, id)).orderBy(asc(s.chatMessages.createdAt));
  return c.json({
    conversation: { id: conv.id, title: conv.title },
    messages: rows.map((r) => ({ role: r.role, text: r.content, links: ((r.toolCalls as { links?: ToolLink[] } | null)?.links ?? []) as ToolLink[] })),
  });
});

assistant.delete('/assistant/conversations/:id', async (c) => {
  const id = parse(z.string().uuid(), c.req.param('id'));
  const { db } = await getDb();
  await db.delete(s.chatConversations).where(and(eq(s.chatConversations.id, id), eq(s.chatConversations.userId, c.get('userId'))));
  return c.json({ ok: true });
});

assistant.post('/assistant/parse-booking', async (c) => {
  const { text } = await jsonBody(c, z.object({ text: z.string().trim().min(20, 'Paste the whole confirmation.').max(8000) }));
  return c.json(await parseBooking(text, llmProvider()));
});

// ---------- Speech to text (fallback for browsers without built-in voice typing) ----------

const sttProvider = () => (process.env.DEEPGRAM_API_KEY ? 'deepgram' : process.env.OPENAI_API_KEY ? 'whisper' : null);

assistant.get('/assistant/voice', (c) => c.json({ stt: sttProvider() }));

assistant.post('/assistant/stt', async (c) => {
  const provider = sttProvider();
  if (!provider) throw new AppError(503, 'stt_not_configured', 'Voice typing on this browser needs a speech-to-text key on the server. You can type instead.');
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const audio = form.audio;
  const lang = typeof form.lang === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(form.lang) ? form.lang : 'en-IN';
  if (!(audio instanceof File) || audio.size > 4 * 1024 * 1024) throw new AppError(400, 'invalid_input', 'Send a short voice clip (up to 4 MB).');
  const bytes = Buffer.from(await audio.arrayBuffer());
  let text = '';
  if (provider === 'deepgram') {
    const res = await fetch(`https://api.deepgram.com/v1/listen?smart_format=true&language=${lang.slice(0, 2)}`, {
      method: 'POST',
      headers: { authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'content-type': audio.type || 'audio/webm' },
      body: bytes,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new AppError(502, 'stt_failed', 'Could not understand the recording. Try again or type.');
    const j = (await res.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
    text = j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  } else {
    const fd = new FormData();
    fd.set('file', new File([bytes], 'clip.webm', { type: audio.type || 'audio/webm' }));
    fd.set('model', 'whisper-1');
    fd.set('language', lang.slice(0, 2));
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new AppError(502, 'stt_failed', 'Could not understand the recording. Try again or type.');
    text = ((await res.json()) as { text?: string }).text ?? '';
  }
  return c.json({ text: text.trim() });
});
