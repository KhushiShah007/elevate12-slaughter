// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';
delete process.env.RAZORPAY_KEY_ID;
delete process.env.ALLOW_REAL_OUTBOUND;

const { app } = await import('../app');
const { hmacHex, MOCK_SECRET } = await import('../payments');
const { readReply } = await import('../routes/cancellations');
const { getDb, schema } = await import('../db/client');

let cookie = '';
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any, res };
};

const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function payFor(clientId: string, amountInr: number, extra: object = {}) {
  const order = await call('POST', '/payments/checkout', {
    idempotencyKey: `key-${clientId}`,
    booking: { clientId, kind: 'hotel', title: 'Pearl Palace, Jaipur', amountInr, startsAt: soon(20), cancellationPolicy: { kind: 'hotel', totalInr: amountInr, nights: 3, freeCancelUntil: soon(10), penaltyNights: 1, nonRefundable: false }, ...extra },
  });
  const pay = await call('POST', '/payments/demo-pay', { orderId: order.body.orderId, outcome: 'success' });
  const verified = await call('POST', '/payments/verify', { orderId: pay.body.orderId, paymentId: pay.body.paymentId, signature: pay.body.signature, method: 'upi' });
  return { order, pay, verified };
}

describe('payments (demo provider)', () => {
  beforeAll(async () => {
    const post = (p: string, b: unknown) => app.request(`/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const otp = (await (await post('/auth/otp', { contact: 'payer@example.com', purpose: 'signup' })).json()) as { devCode: string };
    const res = await post('/auth/signup', { name: 'Payer', contact: 'payer@example.com', code: otp.devCode, password: 'password-123' });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
  }, 120_000);

  it('books and pays in test mode, idempotently, with a receipt and a confirmation in the Outbox', async () => {
    const { order, verified } = await payFor('bk-1', 9000);
    expect(order.body.provider).toBe('mock');
    expect(verified.body.booking).toMatchObject({ status: 'confirmed', source: 'in_app', amountInr: 9000 });
    const again = await call('POST', '/payments/checkout', { idempotencyKey: 'key-bk-1', booking: { clientId: 'bk-1', kind: 'hotel', title: 'x', amountInr: 9000 } });
    expect(again.body.orderId).toBe(order.body.orderId);
    const receipt = await app.request(`/api/bookings/${verified.body.booking.id}/receipt`, { headers: { cookie } });
    expect(receipt.headers.get('content-type')).toBe('application/pdf');
    expect((await receipt.text()).startsWith('%PDF')).toBe(true);
    const { db } = await getDb();
    const outbox = await db.select().from(schema.outboundMessages);
    expect(outbox.some((m) => m.subject?.startsWith('Booking confirmed') && m.status === 'dry_run')).toBe(true);
  });

  it('rejects a forged payment signature', async () => {
    const order = await call('POST', '/payments/checkout', { idempotencyKey: 'key-forged', booking: { clientId: 'bk-forged', kind: 'flight', title: 'BOM-GOI', amountInr: 5000 } });
    const res = await call('POST', '/payments/verify', { orderId: order.body.orderId, paymentId: 'pay_x', signature: 'ab'.repeat(32) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_signature');
  });

  it('checks webhook signatures and handles each event once', async () => {
    const order = await call('POST', '/payments/checkout', { idempotencyKey: 'key-hook', booking: { clientId: 'bk-hook', kind: 'experience', title: 'Food walk', amountInr: 1500 } });
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_hook1', order_id: order.body.orderId, method: 'card' } } } });
    expect((await call('POST', '/payments/webhook', raw, { 'x-razorpay-signature': 'deadbeef' })).status).toBe(401);
    const sig = hmacHex(MOCK_SECRET, raw);
    const ok = await call('POST', '/payments/webhook', raw, { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_1' });
    expect(ok.status).toBe(200);
    expect((await call('POST', '/payments/webhook', raw, { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_1' })).status).toBe(200);
    const { db } = await getDb();
    const events = (await db.select().from(schema.paymentEvents)).filter((e) => e.providerEventId === 'evt_1');
    expect(events).toHaveLength(1);
    const list = await call('GET', '/bookings');
    expect(list.body.bookings.find((b: { clientId: string }) => b.clientId === 'bk-hook').status).toBe('confirmed');
  });

  it('limits points to the balance and 20% of the booking', async () => {
    const pts = await call('GET', '/payments/points');
    expect(pts.body.balance).toBeGreaterThan(0); // 3% of the confirmed bookings above
    const tooMany = await call('POST', '/payments/checkout', { idempotencyKey: 'key-pts', pointsToUse: 99999, booking: { clientId: 'bk-pts', kind: 'flight', title: 'x', amountInr: 4000 } });
    expect(tooMany.status).toBe(400);
  });
});

describe('cancellation and refund center', () => {
  it('cancels an in-app booking: quote, confirm, refund through the provider, booking cancelled', async () => {
    const { verified } = await payFor('bk-cancel', 6000);
    const quote = await call('POST', '/cancellations/quote', { bookingId: verified.body.booking.id, reason: 'Plans changed' });
    expect(quote.body.request.status).toBe('quoted');
    expect(quote.body.estimate).toMatchObject({ refundInr: 6000, feeInr: 0 }); // before the free-cancellation deadline
    // Nothing happens without explicit confirmation.
    expect((await call('POST', `/cancellations/${quote.body.request.id}/confirm`, {})).status).toBe(400);
    const done = await call('POST', `/cancellations/${quote.body.request.id}/confirm`, { confirm: true });
    expect(done.body.request).toMatchObject({ status: 'refunded', refundedInr: 6000 });
    const again = await call('POST', `/cancellations/${quote.body.request.id}/confirm`, { confirm: true });
    expect(again.body.request.status).toBe('refunded'); // idempotent
    const detail = await call('GET', `/cancellations/${quote.body.request.id}`);
    expect(detail.body.events.map((e: { toStatus: string }) => e.toStatus).filter(Boolean)).toEqual(['draft', 'quoted', 'user_confirmed', 'submitted', 'refunded']);
    const list = await call('GET', '/bookings');
    expect(list.body.bookings.find((b: { clientId: string }) => b.clientId === 'bk-cancel')).toMatchObject({ status: 'cancelled', refundedInr: 6000 });
  });

  it('helps cancel an outside booking: email drafted, sent only on tap, to the Outbox in demo mode', async () => {
    process.env.RESEND_API_KEY = 'test-key'; // a key alone must not send anything
    process.env.EMAIL_FROM = 'noreply@example.com';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const quote = await call('POST', '/cancellations/quote', { booking: { clientId: 'ext-1', kind: 'flight', title: 'IndiGo 6E 5321 BOM-GOI', amountInr: 11480, provider: 'IndiGo', pnr: 'K9TQ2M', startsAt: soon(30), paymentMethod: 'card' } });
    const id = quote.body.request.id;
    expect(quote.body.estimate.policyIsEstimate).toBe(true);
    const draft = await call('POST', `/cancellations/${id}/email/draft`, { kind: 'cancel' });
    expect(draft.body.body).toContain('K9TQ2M');
    expect(draft.body.to).toBeNull(); // no unverified address is ever filled in
    expect(draft.body.supportUrl).toBe('https://www.goindigo.in/');
    const noTap = await call('POST', `/cancellations/${id}/email/send`, { to: 'support@example.com', subject: draft.body.subject, body: draft.body.body });
    expect(noTap.status).toBe(400);
    const sent = await call('POST', `/cancellations/${id}/email/send`, { to: 'support@example.com', subject: draft.body.subject, body: draft.body.body, confirm: true });
    expect(sent.body.outbox.status).toBe('dry_run');
    expect(sent.body.request.status).toBe('submitted');
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('resend.com'))).toBe(false);
    fetchSpy.mockRestore();
    delete process.env.RESEND_API_KEY;

    // The traveller records progress; wrong moves are refused.
    expect((await call('POST', `/cancellations/${id}/status`, { to: 'acknowledged' })).status).toBe(200);
    expect((await call('POST', `/cancellations/${id}/status`, { to: 'refunded', amountInr: 7000, note: 'Received in bank' })).body.request.refundedInr).toBe(7000);
    expect((await call('POST', `/cancellations/${id}/status`, { to: 'processing' })).status).toBe(409);
  });

  it('reads a provider reply into a suggestion (never applied automatically)', () => {
    expect(readReply('Your refund of INR 7,000 has been processed. Refund reference: RF12345678.')).toEqual({ amountInr: 7000, reference: 'RF12345678', suggests: 'refunded' });
    expect(readReply('We regret your fare is not eligible for refund.').suggests).toBe('rejected');
  });
});
