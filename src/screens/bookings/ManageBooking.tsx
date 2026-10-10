import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ExternalLink, FileText, Timer } from 'lucide-react';
import { db } from '../../db/db';
import { PageHeader } from '../../components/layout/PageHeader';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';
import { api, ApiError } from '../../api/client';
import { markCancelled, policyFor } from '../../db/repos/booking';
import { countdown, type RefundEstimate } from '../../engines/refund';
import { inr } from '../../utils/format';
import type { Booking, Trip } from '../../types';
import NotFound from '../NotFound';

interface Quote {
  request: { id: string; status: string };
  estimate: RefundEstimate & { policyIsEstimate: boolean };
}

const METHOD: Record<string, string> = { original: 'your original payment method', creditShell: 'an airline credit shell (voucher)' };

/** One booking: receipt, free-cancellation countdown, and Cancel / Manage. */
export default function ManageBooking() {
  const { tripId = '', bookingId = '' } = useParams();
  const navigate = useNavigate();
  const booking = useLiveQuery(() => db.bookings.get(bookingId), [bookingId]);
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId]);
  const [now, setNow] = useState(() => new Date());
  const [reason, setReason] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [autoFollowUp, setAutoFollowUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const policy = useMemo(() => (booking && trip ? (booking.policy ?? policyFor(booking, trip)) : null), [booking, trip]);
  if (booking === undefined || trip === undefined) return null;
  if (!booking || !trip) return <NotFound />;

  const free = policy?.kind === 'hotel' ? (policy.freeCancelUntil as string | null) : policy?.kind !== 'flight' && policy?.startsAt ? new Date(Date.parse(policy.startsAt as string) - 24 * 3_600_000).toISOString() : null;
  const left = countdown(free, now);

  const getQuote = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = booking.serverBookingId
        ? { bookingId: booking.serverBookingId, reason: reason || undefined }
        : {
            booking: {
              clientId: booking.id,
              kind: booking.kind === 'experience' ? 'experience' : booking.kind,
              title: booking.title,
              amountInr: booking.amount,
              provider: booking.provider ?? booking.details?.provider ?? null,
              pnr: booking.pnr ?? null,
              startsAt: (policy?.departAt as string) ?? (policy?.startsAt as string) ?? `${trip.startDate.slice(0, 10)}T06:00:00+05:30`,
              endsAt: `${trip.endDate.slice(0, 10)}T11:00:00+05:30`,
              paymentMethod: 'card',
              policy: booking.policy ?? null,
            },
            reason: reason || undefined,
          };
      setQuote(await api<Quote>('POST', '/cancellations/quote', body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not get a refund estimate.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const { request } = await api<{ request: { id: string; status: string; refundedInr: number } }>('POST', `/cancellations/${quote.request.id}/confirm`, { confirm: true, autoFollowUp });
      if (booking.serverBookingId) await markCancelled(booking.id, request.refundedInr || quote.estimate.refundInr, request.id);
      else await db.bookings.update(booking.id, { cancellationId: request.id });
      navigate(`/refunds/${request.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const cancelled = booking.status === 'cancelled';
  return (
    <div className="pb-10">
      <PageHeader back={`/trips/${trip.id}`} title={cancelled ? 'Cancelled booking' : 'Manage booking'} sub={trip.title} />
      <div className="space-y-4 px-gutter">
        <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-xl text-ink">{booking.title}</p>
            <Chip tone={cancelled ? 'bad' : 'ok'} dot>
              {cancelled ? 'Cancelled' : booking.bookedViaApp ? 'Booked in Voyage' : 'Booked elsewhere'}
            </Chip>
          </div>
          {booking.pnr && <p className="mt-1 font-mono text-sm text-espresso">PNR {booking.pnr}</p>}
          <p className="mt-2 text-sm text-espresso">
            {inr(booking.amount)}
            {booking.pointsUsed ? ` · ${booking.pointsUsed} points used` : ''}
            {booking.refundInr ? ` · ${inr(booking.refundInr)} refunded` : ''}
          </p>
          {booking.serverBookingId && (
            <a href={`/api/bookings/${booking.serverBookingId}/receipt`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-tap items-center gap-1.5 text-sm font-medium text-ink underline underline-offset-4">
              <FileText size={14} /> Receipt (PDF)
            </a>
          )}
          {!cancelled && left && (
            <p className="mt-2 flex items-center gap-1.5 rounded-md bg-mint px-3 py-2 text-sm text-ink">
              <Timer size={14} /> Free cancellation ends in <span className="font-semibold">{left}</span>
            </p>
          )}
        </div>

        {booking.cancellationId && (
          <Link to={`/refunds/${booking.cancellationId}`} className="flex min-h-tap items-center justify-between rounded-pill border border-line bg-paper px-5 text-sm font-medium text-ink">
            Track the refund <ExternalLink size={14} />
          </Link>
        )}

        {!cancelled && !booking.cancellationId && !quote && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-espresso">Reason (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Plans changed" className="min-h-tap w-full rounded-md border border-line bg-paper px-4 text-base outline-none focus:border-ink" />
            </label>
            {error && <p className="text-sm text-bad">{error}</p>}
            <PillButton full variant="ghost" disabled={busy} onClick={() => void getQuote()}>
              {busy ? 'Working out your refund…' : 'Cancel booking: see the refund first'}
            </PillButton>
          </div>
        )}

        {quote && !cancelled && (
          <div className="space-y-3 rounded-lg border border-line bg-paper p-5 shadow-card">
            <p className="text-lg text-ink">
              You will get back about <span className="font-semibold">{inr(quote.estimate.refundInr)}</span> (fee {inr(quote.estimate.feeInr)}), via {METHOD[quote.estimate.method]}, expected in about{' '}
              {quote.estimate.days || 1} {quote.estimate.days === 1 ? 'day' : 'days'}.
            </p>
            <ul className="space-y-1 text-sm">
              {quote.estimate.components.map((c) => (
                <li key={c.label} className="flex justify-between">
                  <span className="text-espresso">{c.label}</span>
                  <span className={`tabular-nums ${c.amountInr < 0 ? 'text-bad' : 'text-ink'}`}>{c.amountInr < 0 ? `−${inr(-c.amountInr)}` : inr(c.amountInr)}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-md bg-ivory px-3 py-2 text-xs leading-relaxed text-espresso">
              {booking.serverBookingId
                ? 'How you get paid: Voyage asks the payment provider to send the money back to the card, UPI or bank account you paid with. Banks usually take a few working days to show it.'
                : 'This was booked outside Voyage, so the provider must cancel it. Next, we help you send them a clear cancellation and refund request and track it until the money arrives.'}
              {quote.estimate.notes.map((n) => (
                <span key={n} className="mt-1 block">
                  {n}
                </span>
              ))}
              {quote.estimate.policyIsEstimate && <span className="mt-1 block font-medium">Policy not supplied by the provider: this is an estimate (demo data).</span>}
            </div>
            <label className="flex min-h-tap items-center gap-2 text-sm text-espresso">
              <input type="checkbox" checked={autoFollowUp} onChange={(e) => setAutoFollowUp(e.target.checked)} className="h-5 w-5 accent-ink" />
              Follow up for me automatically if there is no reply in 3 days
            </label>
            {error && <p className="text-sm text-bad">{error}</p>}
            <PillButton full disabled={busy} onClick={() => void confirm()} icon={<AlertTriangle size={16} />}>
              {busy ? 'Cancelling…' : booking.serverBookingId ? `Cancel and refund ${inr(quote.estimate.refundInr)}` : 'Yes, cancel: help me contact the provider'}
            </PillButton>
            <button onClick={() => setQuote(null)} className="min-h-tap w-full text-sm text-espresso underline underline-offset-4">
              Keep my booking
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export type { Booking, Trip };
