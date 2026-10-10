import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Payments behind one interface. Razorpay (test mode) when its keys are set; otherwise a
// demo provider that behaves the same way (orders, HMAC signatures, webhooks, refunds)
// so the whole flow can be tried without money. Card details never reach Voyage.

export interface PaymentProvider {
  name: 'razorpay' | 'mock';
  /** Public key id for the checkout widget (Razorpay only). */
  publicKey: string | null;
  createOrder(amountPaise: number, receipt: string): Promise<{ orderId: string }>;
  verifyPayment(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhook(rawBody: string, signature: string): boolean;
  refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<{ refundId: string; status: 'processed' | 'pending' | 'failed' }>;
}

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};
export const hmacHex = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');

function razorpay(): PaymentProvider {
  const keyId = process.env.RAZORPAY_KEY_ID!;
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  const auth = `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`;
  const call = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`razorpay ${path} ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    name: 'razorpay',
    publicKey: keyId,
    async createOrder(amountPaise, receipt) {
      const o = await call<{ id: string }>('/orders', { amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40) });
      return { orderId: o.id };
    },
    verifyPayment: (orderId, paymentId, signature) => safeEqualHex(hmacHex(secret, `${orderId}|${paymentId}`), signature),
    verifyWebhook: (raw, signature) => !!process.env.RAZORPAY_WEBHOOK_SECRET && safeEqualHex(hmacHex(process.env.RAZORPAY_WEBHOOK_SECRET, raw), signature),
    async refund(paymentId, amountPaise, notes) {
      const r = await call<{ id: string; status: string }>(`/payments/${paymentId}/refund`, { amount: amountPaise, speed: 'normal', notes });
      return { refundId: r.id, status: r.status === 'processed' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending' };
    },
  };
}

/** Demo secret: not a real credential; it only signs demo payments on this server. */
export const MOCK_SECRET = process.env.MOCK_PAYMENT_SECRET ?? 'voyage-demo-payments';

function mock(): PaymentProvider {
  return {
    name: 'mock',
    publicKey: null,
    async createOrder() {
      return { orderId: `order_demo_${randomBytes(8).toString('hex')}` };
    },
    verifyPayment: (orderId, paymentId, signature) => safeEqualHex(hmacHex(MOCK_SECRET, `${orderId}|${paymentId}`), signature),
    verifyWebhook: (raw, signature) => safeEqualHex(hmacHex(MOCK_SECRET, raw), signature),
    async refund() {
      return { refundId: `rfnd_demo_${randomBytes(6).toString('hex')}`, status: 'processed' };
    },
  };
}

export const paymentProvider = (): PaymentProvider => (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? razorpay() : mock());
