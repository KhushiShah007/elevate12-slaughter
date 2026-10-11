import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader } from '../../components/layout/PageHeader';
import { Toggle } from '../../components/ui/Toggle';

export interface Notice {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  critical: boolean;
  status: string;
  step: number;
  dueAt: string;
  readAt: string | null;
  ackAt: string | null;
}
interface NoticeEvent {
  id: number;
  step: number;
  channel: string | null;
  action: string;
  detail: string | null;
  at: string;
}
type Channel = 'push' | 'email' | 'sms' | 'whatsapp' | 'voice';
interface Prefs {
  channels: Partial<Record<Channel, boolean>>;
  phone: string | null;
  email: string | null;
  timezone: string;
  quietStart: number;
  quietEnd: number;
  dailyCapInr: number;
  smsStopped: boolean;
}
export interface NoticeList {
  notifications: Notice[];
  upcoming: Notice[];
  unread: number;
  needsAck: number;
}

export const needsAck = (n: Notice) => n.critical && !n.ackAt && (n.status === 'escalating' || n.status === 'delivered');
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const mins = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const CHANNELS: [Channel, string, string][] = [
  ['push', 'Push notifications', 'On this device'],
  ['email', 'Email', 'Receipts and reminders'],
  ['whatsapp', 'WhatsApp', 'Urgent alerts if you have not acknowledged'],
  ['sms', 'SMS', 'Urgent alerts if you have not acknowledged. Reply STOP to opt out'],
  ['voice', 'Automated phone call', 'Last resort for urgent alerts. At most 2 calls, never in quiet hours'],
];

const ACTION: Record<string, string> = {
  sent: 'Sent',
  dry_run: 'Demo mode (logged to Outbox, not sent)',
  failed: 'Failed',
  waiting: 'Waiting for you to acknowledge',
  escalated: 'Not acknowledged: next channel',
  acknowledged: 'Acknowledged',
  deferred: 'Held until quiet hours end',
  finished: 'All steps used',
};

/** Polls the list; the server delivers anything due on each poll. */
export function useNotices(intervalMs = 30_000) {
  const [data, setData] = useState<NoticeList | null>(null);
  const load = useCallback(() => api<NoticeList>('GET', '/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);
  return { data, reload: load };
}

function Timeline({ id }: { id: string }) {
  const [events, setEvents] = useState<NoticeEvent[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ events: NoticeEvent[] }>('GET', `/notifications/me/${id}/events`).then((r) => alive && setEvents(r.events)).catch(() => {});
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);
  if (!events) return <p className="px-4 pb-3 text-xs text-muted">Loading…</p>;
  return (
    <ol className="space-y-1 px-4 pb-3 text-xs">
      {events.map((e) => (
        <li key={e.id} className="flex gap-2">
          <span className="shrink-0 tabular-nums text-muted">{new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="text-ink">
            {e.channel ? <span className="font-medium">{e.channel.replace('_', '-')}: </span> : null}
            {e.action.startsWith('skipped_') ? `Skipped (${e.detail})` : (ACTION[e.action] ?? e.action)}
            {e.detail && !e.action.startsWith('skipped_') && e.action !== 'waiting' ? <span className="text-muted"> · {e.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AckButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api('POST', `/notifications/me/${id}/ack`).catch(() => {});
        setBusy(false);
        onDone();
      }}
      className="min-h-tap rounded-pill bg-ink px-4 text-sm font-medium text-paper disabled:opacity-60"
    >
      Acknowledge
    </button>
  );
}

function NoticeRow({ n, onChange }: { n: Notice; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <li className={n.readAt ? '' : 'bg-butter/30'}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">
            {n.critical && <span className="mr-1 rounded-pill bg-bad/10 px-2 py-0.5 text-[11px] text-bad">Urgent</span>}
            {n.title}
          </span>
          <span className="block text-sm text-espresso">{n.body}</span>
          <span className="mt-1 block text-xs text-muted">
            {when(n.dueAt)} · {n.ackAt ? 'acknowledged' : n.status === 'escalating' ? `escalating (step ${n.step + 1})` : n.status}
          </span>
          <span className="mt-1 flex gap-4 text-xs">
            <button type="button" className="flex items-center gap-1 text-ink underline underline-offset-4" onClick={() => setOpen((o) => !o)}>
              Timeline {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {n.link && (
              <button type="button" className="text-ink underline underline-offset-4" onClick={() => navigate(n.link!)}>
                Open
              </button>
            )}
          </span>
        </span>
        {needsAck(n) && <AckButton id={n.id} onDone={onChange} />}
      </div>
      {open && <Timeline id={n.id} />}
    </li>
  );
}

function Settings() {
  const [p, setP] = useState<Prefs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ prefs: Prefs }>('GET', '/notifications/me/prefs').then((r) => setP(r.prefs)).catch(() => setMsg('Could not load your settings.'));
  }, []);
  if (!p) return msg ? <p className="text-sm text-bad">{msg}</p> : null;
  const set = (patch: Partial<Prefs>) => setP({ ...p, ...patch });
  const save = async () => {
    setMsg(null);
    try {
      const r = await api<{ prefs: Prefs }>('PUT', '/notifications/me/prefs', {
        channels: { push: !!p.channels.push, email: !!p.channels.email, sms: !!p.channels.sms, whatsapp: !!p.channels.whatsapp, voice: !!p.channels.voice },
        phone: p.phone?.trim() || null,
        email: p.email?.trim() || null,
        timezone: p.timezone,
        quietStart: p.quietStart,
        quietEnd: p.quietEnd,
        dailyCapInr: p.dailyCapInr,
      });
      setP(r.prefs);
      setMsg('Saved.');
    } catch (e) {
      setMsg((e as Error).message || 'Could not save.');
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Nothing is sent on a channel until you switch it on here. In this demo, messages are written to the Outbox instead of being sent.</p>
      <div className="divide-y divide-line rounded-md border border-line bg-paper">
        {CHANNELS.map(([key, label, sub]) => (
          <div key={key} className="px-4 py-2">
            <Toggle checked={!!p.channels[key]} onChange={(v) => set({ channels: { ...p.channels, [key]: v } })} label={label} />
            <p className="text-xs text-muted">{sub}</p>
          </div>
        ))}
      </div>
      {p.smsStopped && <p className="text-xs text-warn">You replied STOP, so SMS and WhatsApp are paused. Switch one on again to opt back in.</p>}
      <label className="block text-sm">
        Mobile for SMS, WhatsApp and calls
        <input value={p.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} placeholder="+91 98200 12345" className="mt-1 min-h-tap w-full rounded-md border border-line bg-paper px-3" />
      </label>
      <label className="block text-sm">
        Email
        <input value={p.email ?? ''} onChange={(e) => set({ email: e.target.value })} type="email" className="mt-1 min-h-tap w-full rounded-md border border-line bg-paper px-3" />
      </label>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label>
          Quiet from
          <input type="time" value={hhmm(p.quietStart)} onChange={(e) => set({ quietStart: mins(e.target.value) })} className="mt-1 min-h-tap w-full rounded-md border border-line bg-paper px-3" />
        </label>
        <label>
          Quiet until
          <input type="time" value={hhmm(p.quietEnd)} onChange={(e) => set({ quietEnd: mins(e.target.value) })} className="mt-1 min-h-tap w-full rounded-md border border-line bg-paper px-3" />
        </label>
      </div>
      <label className="block text-sm">
        Daily limit for paid messages (₹)
        <input type="number" min={0} max={500} value={p.dailyCapInr} onChange={(e) => set({ dailyCapInr: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} className="mt-1 min-h-tap w-full rounded-md border border-line bg-paper px-3" />
      </label>
      <button type="button" onClick={save} className="min-h-tap w-full rounded-pill bg-ink text-sm font-medium text-paper">
        Save settings
      </button>
      {msg && <p className="text-center text-xs text-muted">{msg}</p>}
    </div>
  );
}

export default function Notifications() {
  const { data, reload } = useNotices(15_000);
  const [tab, setTab] = useState<'all' | 'settings'>('all');
  useEffect(() => {
    if (data?.unread) void api('POST', '/notifications/me/read-all').catch(() => {});
  }, [data?.unread]);
  const demo = async (scenario: string) => {
    await api('POST', '/notifications/me/demo', { scenario, fast: true }).catch(() => {});
    void reload();
  };
  return (
    <div className="pb-10">
      <PageHeader back="/me" title="Notifications" sub="Reminders, flight alerts and refund updates" />
      <div className="px-gutter">
        <div className="mb-4 flex gap-2">
          {(['all', 'settings'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`min-h-tap flex-1 rounded-pill border border-line text-sm ${tab === k ? 'bg-ink text-paper' : 'bg-paper text-ink'}`}>
              {k === 'all' ? 'Alerts' : 'Channels and consent'}
            </button>
          ))}
        </div>
        {tab === 'settings' ? (
          <Settings />
        ) : (
          <>
            {!data ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : data.notifications.length === 0 ? (
              <p className="rounded-md border border-line bg-paper px-4 py-6 text-center text-sm text-muted">
                <BellRing className="mx-auto mb-2" size={20} />
                No notifications yet. Bookings, refunds and itinerary changes show up here.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line bg-paper">
                {data.notifications.map((n) => (
                  <NoticeRow key={n.id} n={n} onChange={reload} />
                ))}
              </ul>
            )}
            {data && data.upcoming.length > 0 && (
              <section className="pt-5">
                <h2 className="mb-2 text-lg">Scheduled</h2>
                <ul className="divide-y divide-line rounded-md border border-line bg-paper text-sm">
                  {data.upcoming.map((n) => (
                    <li key={n.id} className="px-4 py-2">
                      <span className="block text-ink">{n.title}</span>
                      <span className="block text-xs text-muted">{when(n.dueAt)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="pt-6">
              <h2 className="mb-1 text-lg">Try an urgent alert</h2>
              <p className="mb-2 text-xs text-muted">
                Demo: escalates every minute (normally 30) through the channels you switched on, until you tap Acknowledge. Messages go to the <Link to="/outbox" className="underline underline-offset-4">Outbox</Link>.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['gate_change', 'Gate change'],
                  ['flight_delay', 'Flight delay'],
                  ['flight_cancelled', 'Flight cancelled'],
                  ['leave_by', 'Leave-by reminder'],
                ].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => demo(k)} className="min-h-tap rounded-pill border border-line bg-paper px-4 text-sm text-ink">
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
