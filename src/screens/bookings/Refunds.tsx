import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Mail, Send, ShieldAlert, Timer } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { api, ApiError } from '../../api/client';
import { countdown } from '../../engines/refund';
import { inr } from '../../utils/format';

interface Request {
  id: string;
  status: string;
  booking: { title: string; kind: string; amountInr: number; pnr?: string | null; provider?: string | null; source: 'in_app' | 'external'; quotedRefund?: number };
  expectedBy: string | null;
  refundedInr: number;
  statusChangedAt: string;
  updatedAt: string;
  followUpDue?: boolean;
  overdue?: boolean;
}
interface Event {
  id: number;
  type: string;
  toStatus: string | null;
  actor: string;
  note: string | null;
  data: { subject?: string; body?: string; amountInr?: number; suggests?: string } | null;
  createdAt: string;
}
interface Detail {
  request: Request;
  quote: { refundInr: number; feeInr: number; days: number; method: string } | null;
  events: Event[];
  emails: { id: string; toAddress: string; subject: string; status: string; createdAt: string }[];
  followUpDue: boolean;
  overdue: boolean;
  ladder: { step: string; title: string; url: string | null }[];
}

const LABEL: Record<string, string> = {
  draft: 'Started',
  quoted: 'Refund estimated',
  user_confirmed: 'Confirmed by you',
  submitted: 'Sent to provider',
  acknowledged: 'Provider replied',
  processing: 'Refund processing',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
  rejected: 'Refused',
  disputed: 'Disputed',
};
const tone = (s: string) => (s === 'refunded' ? 'ok' : s === 'rejected' || s === 'disputed' ? 'bad' : 'warn');

/** All cancellations and refunds, newest first. */
export function RefundList() {
  const [list, setList] = useState<Request[] | null>(null);
  useEffect(() => {
    api<{ requests: Request[] }>('GET', '/cancellations')
      .then((r) => setList(r.requests))
      .catch(() => setList([]));
  }, []);
  return (
    <div className="pb-10">
      <PageHeader back title="Refunds" sub="Every cancellation and where its money is." source="cloud" />
      <div className="space-y-3 px-gutter">
        {list?.length === 0 && <p className="text-sm text-muted">No cancellations yet. Open a booking in a trip to cancel it.</p>}
        {list?.map((r) => (
          <Link key={r.id} to={`/refunds/${r.id}`} className="block rounded-lg border border-line bg-paper p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-lg leading-tight text-ink">{r.booking.title}</p>
              <Chip tone={tone(r.status)} dot>
                {LABEL[r.status] ?? r.status}
              </Chip>
            </div>
            <p className="mt-1 text-sm text-espresso">
              {r.refundedInr ? `${inr(r.refundedInr)} back` : r.booking.quotedRefund != null ? `About ${inr(r.booking.quotedRefund)} expected` : ''}
              {r.overdue && <span className="font-semibold text-bad"> · overdue</span>}
              {r.followUpDue && <span className="font-semibold text-ink"> · follow-up ready</span>}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** One cancellation: timeline, the provider email, follow-ups, escalation and "I received it". */
export default function RefundDetail() {
  const { id = '' } = useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ kind: 'cancel' | 'followup' | 'escalate'; to: string; subject: string; body: string; supportUrl: string | null; note: string | null } | null>(null);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Detail>('GET', `/cancellations/${id}`)
      .then(setD)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load.'));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <PageHeader back="/refunds" title="Refund" sub={error} />;
  if (!d) return null;
  const r = d.request;
  const external = r.booking.source === 'external';
  const left = countdown(r.expectedBy, new Date());

  const openDraft = async (kind: 'cancel' | 'followup' | 'escalate') => {
    setError(null);
    const res = await api<{ subject: string; body: string; to: string | null; supportUrl: string | null; note: string | null }>('POST', `/cancellations/${id}/email/draft`, { kind });
    setDraft({ kind, to: res.to ?? '', subject: res.subject, body: res.body, supportUrl: res.supportUrl, note: res.note });
  };
  const send = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await api('POST', `/cancellations/${id}/email/send`, { ...draft, confirm: true });
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Could not send.');
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (to: string, amountInr?: number) => {
    setBusy(true);
    try {
      await api('POST', `/cancellations/${id}/status`, { to, amountInr });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  };
  const suggestion = [...d.events].reverse().find((e) => e.type === 'suggestion');
  const pendingFollowUp = [...d.events].reverse().find((e) => e.type === 'followup' && e.data?.body);
  const open = !['refunded', 'rejected'].includes(r.status);

  return (
    <div className="pb-10">
      <PageHeader back="/refunds" title="Refund tracker" sub={r.booking.title} source="cloud" />
      <div className="space-y-4 px-gutter">
        <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <Chip tone={tone(r.status)} dot>
              {LABEL[r.status]}
            </Chip>
            {r.booking.pnr && <span className="font-mono text-xs text-muted">PNR {r.booking.pnr}</span>}
          </div>
          <p className="mt-3 font-display text-3xl text-ink">{r.refundedInr ? inr(r.refundedInr) : inr(d.quote?.refundInr ?? 0)}</p>
          <p className="text-sm text-espresso">{r.refundedInr ? 'received' : 'expected (estimate)'}</p>
          {open && r.expectedBy && (
            <p className={`mt-2 flex items-center gap-1.5 text-sm ${d.overdue ? 'font-semibold text-bad' : 'text-espresso'}`}>
              <Timer size={14} /> {d.overdue ? `Overdue since ${r.expectedBy.slice(0, 10)}` : `Expected by ${r.expectedBy.slice(0, 10)}${left ? ` (in ${left})` : ''}`}
            </p>
          )}
        </div>

        {suggestion && open && (
          <div className="rounded-md border border-ok/40 bg-mint px-4 py-3 text-sm text-ink">
            <p>{suggestion.note}</p>
            {suggestion.data?.suggests && (
              <PillButton small className="mt-2" onClick={() => void setStatus(suggestion.data!.suggests!, suggestion.data!.amountInr ?? undefined)}>
                Confirm this update
              </PillButton>
            )}
          </div>
        )}

        {external && r.status === 'user_confirmed' && !draft && (
          <PillButton full icon={<Mail size={16} />} onClick={() => void openDraft('cancel')}>
            Contact the provider and chase my refund
          </PillButton>
        )}
        {open && (d.followUpDue || pendingFollowUp) && !draft && (
          <PillButton full variant="ghost" icon={<Mail size={16} />} onClick={() => void openDraft('followup')}>
            No reply yet: review the follow-up email
          </PillButton>
        )}

        {draft && (
          <div className="space-y-3 rounded-lg border border-line bg-paper p-4 shadow-card">
            <p className="text-sm font-medium text-ink">Review before sending</p>
            {draft.supportUrl && (
              <a href={draft.supportUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-tap items-center gap-1 text-sm underline underline-offset-4">
                Provider’s official support page <ExternalLink size={12} />
              </a>
            )}
            {draft.note && <p className="text-xs text-muted">{draft.note}</p>}
            <Input label="To (provider support email)" type="email" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            <Input label="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-espresso">Message</span>
              <textarea rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="w-full rounded-md border border-line bg-ivory p-3 text-sm outline-none focus:border-ink" />
            </label>
            <p className="text-xs text-muted">You are copied, and replies come to you. In demo mode the email goes to your Outbox, not the provider.</p>
            {error && <p className="text-sm text-bad">{error}</p>}
            <PillButton full icon={<Send size={16} />} disabled={busy || !draft.to} onClick={() => void send()}>
              Send email
            </PillButton>
            <button onClick={() => setDraft(null)} className="min-h-tap w-full text-sm underline underline-offset-4">
              Not now
            </button>
          </div>
        )}

        {open && r.status !== 'quoted' && r.status !== 'user_confirmed' && (
          <div className="space-y-2 rounded-lg border border-line bg-paper p-4">
            <p className="text-sm font-medium text-ink">Did the money arrive?</p>
            <div className="flex gap-2">
              <input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="numeric" placeholder="Amount received ₹" className="min-h-tap min-w-0 flex-1 rounded-md border border-line bg-ivory px-3 text-sm" aria-label="Amount received" />
              <button
                disabled={busy || !received}
                onClick={() => {
                  const n = Number(received.replace(/[,\s₹]/g, ''));
                  void setStatus(n >= (d.quote?.refundInr ?? n) ? 'refunded' : 'partially_refunded', n);
                }}
                className="flex min-h-tap items-center gap-1 rounded-pill bg-ink px-4 text-sm font-medium text-ivory disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> I received it
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              {r.status === 'submitted' && (
                <button className="min-h-[2rem] rounded-pill border border-line px-3" onClick={() => void setStatus('acknowledged')}>
                  Provider replied
                </button>
              )}
              {['submitted', 'acknowledged'].includes(r.status) && (
                <button className="min-h-[2rem] rounded-pill border border-line px-3" onClick={() => void setStatus('processing')}>
                  Refund is processing
                </button>
              )}
              <button className="min-h-[2rem] rounded-pill border border-line px-3" onClick={() => void setStatus('rejected')}>
                Provider refused
              </button>
            </div>
          </div>
        )}

        {(d.overdue || r.status === 'rejected' || r.status === 'partially_refunded') && (
          <div className="rounded-lg border border-bad/30 bg-rose p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <ShieldAlert size={16} /> If the refund does not come
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-espresso">
              {d.ladder.map((l) => (
                <li key={l.step}>
                  {l.url ? (
                    <a href={l.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                      {l.title}
                    </a>
                  ) : (
                    l.title
                  )}
                </li>
              ))}
            </ol>
            <PillButton small variant="ghost" className="mt-3" onClick={() => void openDraft('escalate')}>
              Write an escalation letter
            </PillButton>
            {r.status === 'rejected' && (
              <button className="ml-2 min-h-[2rem] text-xs underline" onClick={() => void setStatus('disputed')}>
                Mark as disputed
              </button>
            )}
          </div>
        )}

        <section>
          <h2 className="mb-2 text-lg">Timeline</h2>
          <ol className="space-y-2 border-l-2 border-line pl-4">
            {d.events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="block text-xs text-muted">{new Date(e.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-ink">{e.toStatus ? LABEL[e.toStatus] : e.type === 'email' ? 'Email' : e.type === 'reply' ? 'Reply from provider' : 'Note'}</span>
                {e.note && <span className="block text-espresso">{e.note}</span>}
              </li>
            ))}
          </ol>
        </section>
        {d.emails.length > 0 && (
          <Link to="/outbox" className="block text-sm underline underline-offset-4">
            {d.emails.length} email{d.emails.length === 1 ? '' : 's'} in your Outbox
          </Link>
        )}
      </div>
    </div>
  );
}
