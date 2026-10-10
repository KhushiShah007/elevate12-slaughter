// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';
delete process.env.XAI_API_KEY;
delete process.env.GROQ_API_KEY;

const { app } = await import('../app');
const { pricesAreGrounded, rupeesIn } = await import('../ai/chat');
const { datesIn, timesIn, parseByRules, groundBooking } = await import('../ai/booking');

let cookie = '';
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};

/** Stand-in for the Grok API: answers each request with the next scripted message. */
function fakeGrok(script: object[]) {
  const realFetch = globalThis.fetch;
  const seen: { messages: { role: string; content: string | null }[] }[] = [];
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith('https://api.x.ai/')) {
      seen.push(JSON.parse(String(init?.body)));
      const message = script.shift() ?? { role: 'assistant', content: 'Done.' };
      return new Response(JSON.stringify({ model: 'grok-test', choices: [{ message }] }), { status: 200 });
    }
    return realFetch(url as string, init);
  });
  return seen;
}

describe('assistant API', () => {
  beforeAll(async () => {
    const post = (p: string, b: unknown) => app.request(`/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const otp = (await (await post('/auth/otp', { contact: 'chat@example.com', purpose: 'signup' })).json()) as { devCode: string };
    const res = await post('/auth/signup', { name: 'Meera', contact: 'chat@example.com', code: otp.devCode, password: 'password-123' });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
    await call('POST', '/sync/push', {
      key: crypto.randomUUID(),
      table: 'trips',
      recordId: 'trip-1',
      op: 'put',
      baseRev: 0,
      payload: { id: 'trip-1', title: 'Jaipur with Nani', from: 'Mumbai', to: 'Jaipur', destinationSlug: 'jaipur', startDate: '2027-01-10', endDate: '2027-01-13', travellers: 2, budgetInr: 45000, status: 'upcoming' },
    });
  }, 120_000);
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.XAI_API_KEY;
  });

  it('answers from built-in rules when no AI key is set (never an error)', async () => {
    expect((await call('GET', '/assistant/status')).body).toMatchObject({ provider: null, fallback: 'rules' });
    const res = await call('POST', '/assistant/chat', { message: 'What trips do I have?' });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('rules');
    expect(res.body.reply).toContain('Jaipur with Nani');
    expect(res.body.links[0].to).toBe('/trips/trip-1');
  });

  it('replans the day from chat ("I feel sick today"), undoable', async () => {
    await call('POST', '/itineraries/trip-1/generate');
    const res = await call('POST', '/assistant/chat', { message: 'I feel sick today' });
    expect(res.body.reply).toMatch(/changed .* of Jaipur with Nani/);
    expect(res.body.reply).toContain('112');
    expect(res.body.links[0].to).toBe('/trips/trip-1/itinerary');
    const it2 = await call('GET', '/itineraries/trip-1');
    expect(it2.body.versions[0].reason).toBe('Feeling sick');
  });

  it('starts a cancellation from chat but never cancels by itself', async () => {
    const res = await call('POST', '/assistant/chat', { message: 'cancel something that does not exist' });
    expect(res.body.reply).toMatch(/No confirmed booking matches/);
  });

  it('streams replies as server-sent events', async () => {
    const res = await app.request('/api/assistant/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ message: 'what is my budget' }) });
    const text = await res.text();
    expect(text).toContain('event: done');
    expect(text).toContain('Jaipur with Nani');
  });

  it('answers from tool data, links to the trip, and saves the conversation', async () => {
    process.env.XAI_API_KEY = 'test-key';
    const seen = fakeGrok([
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_my_trips', arguments: '{}' } }] },
      { role: 'assistant', content: 'Your trip Jaipur with Nani runs 10 to 13 January for 2 people, with a budget of ₹45,000.' },
    ]);
    const res = await call('POST', '/assistant/chat', { message: 'What trips do I have?', lang: 'en' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'grok', grounded: true });
    expect(res.body.reply).toContain('₹45,000');
    expect(res.body.links[0]).toEqual({ label: 'Jaipur with Nani', to: '/trips/trip-1' });
    // The tool result the model saw came from this traveller's real trip.
    const toolMsg = seen[1].messages.find((m) => m.role === 'tool')!;
    expect(toolMsg.content).toContain('"budgetInr":45000');
    expect(seen[0].messages[0].content).toContain('Meera');

    const list = await call('GET', '/assistant/conversations');
    expect(list.body.conversations.some((cv: { id: string }) => cv.id === res.body.conversationId)).toBe(true);
    const conv = await call('GET', `/assistant/conversations/${res.body.conversationId}`);
    expect(conv.body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
  });

  it('removes prices the AI made up', async () => {
    process.env.XAI_API_KEY = 'test-key';
    fakeGrok([
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_my_trips', arguments: '{}' } }] },
      { role: 'assistant', content: 'Flights will cost about ₹3,999.' },
      { role: 'assistant', content: 'Flights will cost about ₹2,500.' },
    ]);
    const res = await call('POST', '/assistant/chat', { message: 'How much are flights?' });
    expect(res.body.grounded).toBe(false);
    expect(res.body.reply).not.toMatch(/₹\s?\d/);
  });

  it('reads a pasted flight booking without AI, keeping only what the text says', async () => {
    const text = `Booking confirmed! PNR: X7K2QP
IndiGo Flight 6E 2134  BOM to JAI
Departure: 18 Dec 2026, 06:45  Arrival 08:30
2 Adults. Total fare: Rs 9,850`;
    const res = await call('POST', '/assistant/parse-booking', { text });
    expect(res.body.source).toBe('rules');
    expect(res.body.booking).toMatchObject({ kind: 'flight', pnr: 'X7K2QP', flightNo: '6E 2134', from: 'BOM', to: 'JAI', departDate: '2026-12-18', departTime: '06:45', arriveTime: '08:30', totalInr: 9850, travellers: 2 });
  });
});

describe('guards', () => {
  it('finds rupee amounts and checks them against tool data', () => {
    expect(rupeesIn('About ₹12,600 or Rs. 900 or INR 45000')).toEqual(['12600', '900', '45000']);
    expect(pricesAreGrounded('It is ₹4,800 to ₹6,700', ['{"pricePerPersonInr":[4800,6700]}'])).toBe(true);
    expect(pricesAreGrounded('It is ₹480', ['{"price":4800}'])).toBe(false);
    expect(pricesAreGrounded('About ₹1,20,000', ['{"note":"budget ₹1,20,000"}'])).toBe(true);
    expect(pricesAreGrounded('About ₹48,006,700', ['[4800,6700]'])).toBe(false);
  });

  it('reads Indian date and time formats', () => {
    expect(datesIn('on 18/12/2026 and 2027-01-05, also Jan 7, 2027 and 9th Feb 27')).toEqual(['2026-12-18', '2027-01-05', '2027-01-07', '2027-02-09']);
    expect(timesIn('dep 6:45 pm, arr 21.30 hrs')).toEqual(['18:45', '21:30']);
  });

  it('drops anything not in the pasted text', async () => {
    const text = 'Hotel Pearl Palace, Jaipur. Check-in 18 Dec 2026, check-out 21 Dec 2026. Total ₹7,200';
    const rules = await parseByRules(text);
    expect(rules).toMatchObject({ kind: 'hotel', checkIn: '2026-12-18', checkOut: '2026-12-21', totalInr: 7200 });
    const grounded = groundBooking({ ...rules, pnr: 'MADEUP', hotelName: 'Taj Palace' }, text);
    expect(grounded.pnr).toBeNull();
    expect(grounded.hotelName).toBeNull();
  });
});
