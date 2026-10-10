import { complete, type LlmMessage, type LlmProvider } from './llm';
import { runTool, TOOLS, type ToolLink } from './tools';

// The assistant's conversation loop: the model may call tools (up to 4 rounds), then
// answers. Rule kept from the rest of the app: facts come from code, the model only
// explains them. A reply's rupee amounts must appear in what the tools returned.

const LANGS: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  hinglish: 'Hinglish (everyday Hindi in Roman letters, mixed with English words)',
  mr: 'Marathi',
  ta: 'Tamil',
  bn: 'Bengali',
};

export function systemPrompt(opts: { name: string; persona: string | null; lang: string; today: string }) {
  return [
    'You are Voyage, a calm, warm travel companion for Indian travellers inside a travel app.',
    `Today is ${opts.today}. The traveller is ${opts.name}${opts.persona ? ` (travel style: ${opts.persona})` : ''}.`,
    `Reply in ${LANGS[opts.lang] ?? 'English'}. Keep replies short: 2 to 5 sentences, or a short list.`,
    'Rules:',
    "- For anything about the traveller's trips, documents, destinations, flights, stays or weather, call a tool first. Never guess.",
    '- Only state prices, times, dates and numbers that a tool returned. Copy them exactly. Use ₹ with Indian digit grouping as given.',
    '- When a tool says priceIsEstimate or live: false, say the price is an estimate.',
    '- If a tool has no answer, say so plainly and suggest what the traveller can do in the app.',
    '- You cannot book, pay, or change anything. Say the app buttons will open the right screen.',
    '- Do not ask for or repeat full ID numbers. Do not give medical, legal or visa-law advice; suggest official sources.',
    '- No emojis.',
  ].join('\n');
}

/** Rupee amounts in a text, as plain digit strings ("₹12,600" → "12600"). */
export const rupeesIn = (text: string) => [...text.matchAll(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)/gi)].map((m) => m[1].replace(/,/g, '').replace(/\.0+$/, ''));

/** Every rupee amount in the reply appears somewhere in the tool results. */
export function pricesAreGrounded(reply: string, toolOutputs: string[]) {
  // Numbers in the tool data. "12,600" or Indian "1,20,000" is one number; the comma in
  // JSON "[4800,6700]" separates two.
  const known = new Set<string>();
  for (const token of toolOutputs.join(' ').match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    if (/^\d{1,3}(,\d{2,3})+(\.\d+)?$/.test(token)) known.add(token.replace(/,/g, '').replace(/\.0+$/, ''));
    for (const part of token.split(',')) if (part) known.add(part.replace(/\.0+$/, ''));
  }
  return rupeesIn(reply).every((n) => known.has(n));
}

export interface ChatTurn {
  reply: string;
  links: ToolLink[];
  toolsUsed: string[];
  model: string;
  grounded: boolean;
}

export async function runChat(p: LlmProvider, userId: string, system: string, history: LlmMessage[], userText: string): Promise<{ turn: ChatTurn; transcript: LlmMessage[] }> {
  const messages: LlmMessage[] = [{ role: 'system', content: system }, ...history.slice(-12), { role: 'user', content: userText }];
  const transcript: LlmMessage[] = [{ role: 'user', content: userText }];
  const outputs: string[] = [];
  const links: ToolLink[] = [];
  const used: string[] = [];
  let model = p.model;

  for (let round = 0; round < 5; round++) {
    const out = await complete(p, messages, { tools: round < 4 ? TOOLS : undefined, maxTokens: 600 });
    model = out.model;
    const msg = out.message;
    if (msg.tool_calls?.length) {
      messages.push(msg);
      transcript.push(msg);
      for (const call of msg.tool_calls.slice(0, 4)) {
        const result = await runTool(userId, call.function.name, call.function.arguments);
        const content = JSON.stringify(result.data).slice(0, 6000);
        outputs.push(content);
        used.push(call.function.name);
        for (const l of result.links) if (!links.some((x) => x.to === l.to)) links.push(l);
        const toolMsg: LlmMessage = { role: 'tool', tool_call_id: call.id, content };
        messages.push(toolMsg);
        transcript.push(toolMsg);
      }
      continue;
    }

    let reply = (msg.content ?? '').trim();
    let grounded = pricesAreGrounded(reply, outputs);
    if (!grounded) {
      // One retry with a firm reminder; if it still invents prices, drop the reply's numbers.
      messages.push(msg, { role: 'user', content: 'Check your reply: only use rupee amounts that appear in the tool results above, copied exactly. Rewrite it.' });
      const retry = await complete(p, messages, { maxTokens: 600 });
      const second = (retry.message.content ?? '').trim();
      grounded = pricesAreGrounded(second, outputs);
      reply = grounded ? second : second.replace(/(?:₹|rs\.?|inr)\s?[\d,]+(?:\.\d+)?/gi, '(see the app for prices)');
    }
    const final: LlmMessage = { role: 'assistant', content: reply };
    transcript.push(final);
    return { turn: { reply, links: links.slice(0, 4), toolsUsed: used, model, grounded }, transcript };
  }
  const reply = 'Sorry, I could not finish that. Please try asking in a simpler way.';
  transcript.push({ role: 'assistant', content: reply });
  return { turn: { reply, links, toolsUsed: used, model, grounded: true }, transcript };
}

/**
 * Streaming variant: tools run first; once data is gathered the final answer streams token
 * by token. The price guard runs on the full text; if it fails, a corrected reply replaces it.
 */
export async function runChatStream(
  p: LlmProvider,
  userId: string,
  system: string,
  history: LlmMessage[],
  userText: string,
  emit: (event: 'tool' | 'delta' | 'replace', data: string) => Promise<void>,
): Promise<ChatTurn> {
  const { completeStream } = await import('./llm');
  const messages: LlmMessage[] = [{ role: 'system', content: system }, ...history.slice(-12), { role: 'user', content: userText }];
  const outputs: string[] = [];
  const links: ToolLink[] = [];
  const used: string[] = [];
  for (let round = 0; round < 4; round++) {
    const out = await complete(p, messages, { tools: TOOLS, maxTokens: 600 });
    const msg = out.message;
    if (!msg.tool_calls?.length) {
      // Answered without tools: send it in small pieces.
      const reply = (msg.content ?? '').trim();
      for (const piece of reply.match(/\S+\s*/g) ?? []) await emit('delta', piece);
      const grounded = pricesAreGrounded(reply, outputs);
      const final = grounded ? reply : reply.replace(/(?:₹|rs\.?|inr)\s?[\d,]+(?:\.\d+)?/gi, '(see the app for prices)');
      if (!grounded) await emit('replace', final);
      return { reply: final, links, toolsUsed: used, model: out.model, grounded };
    }
    messages.push(msg);
    for (const call of msg.tool_calls.slice(0, 4)) {
      await emit('tool', call.function.name);
      const result = await runTool(userId, call.function.name, call.function.arguments);
      const content = JSON.stringify(result.data).slice(0, 6000);
      outputs.push(content);
      used.push(call.function.name);
      for (const l of result.links) if (!links.some((x) => x.to === l.to)) links.push(l);
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
    // Next: the answer itself, streamed (no more tools).
    let reply = '';
    for await (const piece of completeStream(p, messages, { maxTokens: 600 })) {
      reply += piece;
      await emit('delta', piece);
    }
    reply = reply.trim();
    const grounded = pricesAreGrounded(reply, outputs);
    if (!grounded) {
      reply = reply.replace(/(?:₹|rs\.?|inr)\s?[\d,]+(?:\.\d+)?/gi, '(see the app for prices)');
      await emit('replace', reply);
    }
    return { reply, links: links.slice(0, 4), toolsUsed: used, model: p.model, grounded };
  }
  return { reply: 'Sorry, I could not finish that.', links, toolsUsed: used, model: p.model, grounded: true };
}
