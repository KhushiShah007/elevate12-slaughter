import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, jsonBody, parse } from '../http';
import { requireUser } from '../auth';
import { llmProvider, LlmError, type LlmMessage } from '../ai/llm';
import { runChat, systemPrompt } from '../ai/chat';
import { parseBooking } from '../ai/booking';
import type { ToolLink } from '../ai/tools';

// The assistant: chat with tools over the traveller's data, saved conversations,
// and reading pasted bookings.

export const assistant = new Hono<{ Variables: { userId: string } }>();
assistant.use('/assistant/*', requireUser);

assistant.get('/assistant/status', (c) => {
  const p = llmProvider();
  return c.json({ provider: p?.name ?? null, model: p?.model ?? null });
});

const chatBody = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1, 'Type a message.').max(1000),
  lang: z.enum(['en', 'hi', 'hinglish', 'mr', 'ta', 'bn']).default('en'),
});

assistant.post('/assistant/chat', async (c) => {
  const body = await jsonBody(c, chatBody);
  const p = llmProvider();
  if (!p) throw new AppError(503, 'ai_not_configured', 'The AI assistant is not connected yet.');
  const userId = c.get('userId');
  const { db } = await getDb();

  let conversationId = body.conversationId;
  let history: LlmMessage[] = [];
  if (conversationId) {
    const [conv] = await db.select().from(s.chatConversations).where(and(eq(s.chatConversations.id, conversationId), eq(s.chatConversations.userId, userId))).limit(1);
    if (!conv) throw new AppError(404, 'not_found', 'That conversation was deleted.');
    const rows = await db.select().from(s.chatMessages).where(eq(s.chatMessages.conversationId, conversationId)).orderBy(asc(s.chatMessages.createdAt));
    history = rows.filter((r) => r.role === 'user' || r.role === 'assistant').map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
  } else {
    const [conv] = await db.insert(s.chatConversations).values({ userId, title: body.message.slice(0, 60) }).returning();
    conversationId = conv.id;
  }

  const [profile] = await db.select({ name: s.profiles.name, personaId: s.profiles.personaId }).from(s.profiles).where(eq(s.profiles.userId, userId)).limit(1);
  const system = systemPrompt({ name: profile?.name ?? 'Traveller', persona: profile?.personaId ?? null, lang: body.lang, today: new Date().toISOString().slice(0, 10) });

  try {
    const { turn } = await runChat(p, userId, system, history, body.message);
    // Save the question and the final answer (tool traffic is not kept).
    await db.insert(s.chatMessages).values([
      { conversationId, role: 'user', content: body.message },
      { conversationId, role: 'assistant', content: turn.reply, toolCalls: { links: turn.links, tools: turn.toolsUsed, model: turn.model } },
    ]);
    await db.update(s.chatConversations).set({ updatedAt: new Date() }).where(eq(s.chatConversations.id, conversationId));
    return c.json({ conversationId, reply: turn.reply, links: turn.links, provider: p.name, model: turn.model, grounded: turn.grounded });
  } catch (err) {
    if (err instanceof LlmError) {
      throw new AppError(err.kind === 'rate_limited' ? 429 : 502, `ai_${err.kind}`, err.kind === 'rate_limited' ? 'The AI is busy. Try again in a minute.' : 'The AI did not answer. Try again.');
    }
    throw err;
  }
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
