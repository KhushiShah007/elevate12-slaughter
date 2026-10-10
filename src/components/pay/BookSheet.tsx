import { useEffect, useState } from 'react';
import { CreditCard, Lock, Sparkles } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { PillButton } from '../ui/PillButton';
import { Chip } from '../ui/Chip';
import { api, ApiError } from '../../api/client';
import { loadRazorpay, markBooked, startCheckout, type Checkout } from '../../db/repos/booking';
import { redeemFor } from '../../engines/loyalty';
import { useAuth } from '../../state/auth';
import { inr, num } from '../../utils/format';
import type { Booking, Trip } from '../../types';

type RazorpayCtor = new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };

/** Book and pay for a saved option, in test mode. Points can pay up to 20%. */
export function BookSheet({ trip, booking, onClose, onBooked }: { trip: Trip; booking: Booking; onClose: () => void; onBooked: (b: Booking) => void }) {
  const { me } = useAuth();
  const [balance, setBalance] = useState(0);
  const [usePoints, setUsePoints] = useState(true);
  const [step, setStep] = useState<'review' | 'demo' | 'busy' | 'done' | 'failed'>('review');
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ balance: number }>('GET', '/payments/points')
      .then((r) => setBalance(r.balance))
      .catch(() => setBalance(0));
  }, []);

  const r = redeemFor(usePoints ? balance : 0, booking.amount);

  const verify = async (orderId: string, paymentId: string, signature: string, method?: string) => {
    const { booking: server } = await api<{ booking: { id: string } }>('POST', '/payments/verify', { orderId, paymentId, signature, method });
    const done = await markBooked(booking, server.id, r.points);
    setStep('done');
    onBooked(done);
  };

  const pay = async () => {
    setError(null);
    setStep('busy');
    try {
      const co = await startCheckout(booking, trip, r.points);
      setCheckout(co);
      if (co.provider === 'mock') return setStep('demo');
      await loadRazorpay();
      const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
      const rz = new Razorpay({
        key: co.publicKey,
        amount: co.amountInr * 100,
        currency: 'INR',
        order_id: co.orderId,
        name: 'Voyage',
        description: booking.title,
        prefill: { name: me?.name, email: me?.email ?? undefined },
        handler: (res: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
          void verify(res.razorpay_order_id, res.razorpay_payment_id, res.razorpay_signature).catch((e) => {
            setError(e instanceof ApiError ? e.message : 'Payment could not be verified.');
            setStep('failed');
          }),
        modal: { ondismiss: () => setStep('review') },
      });
      rz.on('payment.failed', () => setStep('failed'));
      rz.open();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the payment. Try again.');
      setStep('review');
    }
  };

  const demoPay = async (outcome: 'success' | 'failure') => {
    if (!checkout) return;
    setStep('busy');
    try {
      const res = await api<{ ok: boolean; orderId: string; paymentId: string; signature: string; method: string; message?: string }>('POST', '/payments/demo-pay', { orderId: checkout.orderId, outcome });
      if (!res.ok) {
        setError(res.message ?? 'Payment declined.');
        return setStep('failed');
      }
      await verify(res.orderId, res.paymentId, res.signature, res.method);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Payment failed.');
      setStep('failed');
    }
  };

  return (
    <Sheet open onClose={onClose} title={step === 'done' ? 'Booked' : 'Book in Voyage'}>
      <div className="space-y-4 pb-2">
        <div className="rounded-md border border-line bg-paper p-4">
          <p className="font-display text-lg text-ink">{booking.title}</p>
          {booking.details?.summary && <p className="text-xs text-muted">{booking.details.summary}</p>}
          <p className="mt-2 flex justify-between text-sm">
            <span className="text-espresso">Price</span>
            <span className="tabular-nums">{inr(booking.amount)}</span>
          </p>
          {booking.details?.priceIsEstimate && <p className="mt-1 text-xs text-muted">This is an estimated price (demo data). In test mode nothing is charged.</p>}
        </div>

        {step === 'review' && (
          <>
            <label className="flex min-h-tap items-center justify-between gap-3 rounded-md border border-line bg-butter px-4 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Sparkles size={16} />
                {balance > 0 ? `Use ${num(redeemFor(balance, booking.amount).points)} of your ${num(balance)} points` : 'No points yet (3% back on this booking)'}
              </span>
              <input type="checkbox" disabled={balance === 0} checked={usePoints && balance > 0} onChange={(e) => setUsePoints(e.target.checked)} className="h-5 w-5 accent-ink" />
            </label>
            <p className="flex justify-between text-base font-semibold text-ink">
              <span>To pay</span>
              <span className="tabular-nums">{inr(r.payInr)}</span>
            </p>
            {error && <p className="text-sm text-bad">{error}</p>}
            <PillButton full icon={<Lock size={16} />} onClick={() => void pay()}>
              Pay {inr(r.payInr)} (test mode)
            </PillButton>
            <p className="text-center text-xs text-muted">Payments run in test mode. Voyage never sees or stores card details.</p>
          </>
        )}

        {step === 'demo' && checkout && (
          <div className="space-y-3 rounded-md border-2 border-dashed border-warn/50 bg-butter/50 p-4">
            <Chip tone="warn" dot>
              Demo payment
            </Chip>
            <p className="text-sm text-ink">Razorpay keys are not set, so this stands in for the payment screen. No money moves.</p>
            <PillButton full icon={<CreditCard size={16} />} onClick={() => void demoPay('success')}>
              Pay {inr(checkout.amountInr)} with UPI (demo)
            </PillButton>
            <button onClick={() => void demoPay('failure')} className="min-h-tap w-full text-sm text-espresso underline underline-offset-4">
              Simulate a declined payment
            </button>
          </div>
        )}

        {step === 'busy' && <p className="text-center text-sm text-muted">Working…</p>}
        {step === 'failed' && (
          <>
            <p className="text-sm text-bad">{error ?? 'Payment failed.'} Nothing was charged.</p>
            <PillButton full variant="ghost" onClick={() => setStep('review')}>
              Try again
            </PillButton>
          </>
        )}
        {step === 'done' && (
          <>
            <p className="text-sm text-ink">Confirmed. A receipt is in the trip’s bookings and a confirmation email is in your Outbox.</p>
            <PillButton full onClick={onClose}>
              Done
            </PillButton>
          </>
        )}
      </div>
    </Sheet>
  );
}
