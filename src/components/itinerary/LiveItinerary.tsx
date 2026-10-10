import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, Camera, CalendarPlus, CloudRain, Coffee, FileDown, HeartPulse, History, Lock, LockOpen, Plus, RefreshCw, SkipForward, Sun, Timer, Undo2, Utensils } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { ApiError } from '../../api/client';
import { adaptItinerary, generateItinerary, getItinerary, lockItem, undoItinerary, type AdaptView, type ItineraryView } from '../../api/itinerary';
import { useGuide } from '../../hooks/useGuide';
import { day as fmtDay, inr } from '../../utils/format';
import type { PlanItem } from '../../engines/planner';
import type { Trip } from '../../types';

const ICON: Record<PlanItem['type'], typeof Camera> = { experience: Camera, restaurant: Utensils, transport: Timer, rest: BedDouble, free: HeartPulse };

const FEELINGS = [
  { mode: 'sick', label: 'Feeling sick', Icon: HeartPulse },
  { mode: 'tired', label: 'Tired / low energy', Icon: Coffee },
  { mode: 'lighter', label: 'Want a lighter day', Icon: Sun },
  { mode: 'rain', label: 'Rain / bad weather', Icon: CloudRain },
  { mode: 'late', label: 'Running late', Icon: Timer },
] as const;

/** The trip's living itinerary: builds itself, adapts on request, versioned with Undo. */
export function LiveItinerary({ trip }: { trip: Trip }) {
  const [v, setV] = useState<ItineraryView | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<AdaptView | null>(null);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const versionRef = useRef(0);
  const { guide } = useGuide(trip);

  const load = useCallback(async () => {
    try {
      let next = await getItinerary(trip.id);
      if (!next.itinerary) next = await generateItinerary(trip.id);
      versionRef.current = next.itinerary?.version ?? 0;
      setV(next);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the itinerary.');
    }
  }, [trip.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: another device (or a co-traveller) changed the plan.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(`/api/itineraries/${trip.id}/events`);
    es.addEventListener('version', (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as { version: number };
      if (msg.version > versionRef.current) void load();
    });
    const poll = setInterval(() => void load(), 60_000); // fallback where streams are cut
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [trip.id, load]);

  const run = async (fn: () => Promise<ItineraryView | AdaptView>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      versionRef.current = next.itinerary?.version ?? versionRef.current;
      setV(next);
      if ('warnings' in next) setLast(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await load();
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !v) return <p className="text-sm text-bad">{error}</p>;
  if (!v?.itinerary) return <p className="text-sm text-muted">Building your plan from places, hours, budget and weather…</p>;
  const plan = v.itinerary.plan;
  const today = new Date().toISOString().slice(0, 10);
  const current = plan.days.find((d) => d.date === date) ?? plan.days.find((d) => d.date === today) ?? plan.days.find((d) => d.kind === 'full') ?? plan.days[0];
  const base = v.itinerary.version;
  const visible = current.items.filter((i) => i.status !== 'postponed' || !current.items.some((x) => x.placeId === i.placeId && x.status === 'planned' && x !== i));
  const dayCost = current.items.filter((i) => i.status === 'planned').reduce((s, i) => s + i.costPerPerson, 0);

  return (
    <div className="space-y-4 pb-8">
      {/* Calendar strip */}
      <div className="no-scrollbar -mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1">
        {plan.days.map((d) => {
          const on = d.date === current.date;
          return (
            <button
              key={d.date}
              onClick={() => setDate(d.date)}
              aria-pressed={on}
              className={`relative flex min-h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center rounded-md border ${on ? 'border-ink bg-ink text-ivory' : 'border-line bg-paper text-ink'}`}
            >
              <span className="text-[0.625rem] font-semibold uppercase tracking-widest opacity-80">{fmtDay(d.date, { weekday: 'short' })}</span>
              <span className="font-display text-2xl">{fmtDay(d.date, { day: 'numeric' }, 'en-GB')}</span>
              {d.rainLikely && <CloudRain size={11} className="absolute bottom-1" />}
            </button>
          );
        })}
      </div>

      {/* How are you feeling today? */}
      <div className="rounded-lg border border-line bg-butter p-4">
        <p className="font-display text-lg text-ink">How are you feeling today?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FEELINGS.map(({ mode, label, Icon }) => (
            <button
              key={mode}
              disabled={busy}
              onClick={() => void run(() => adaptItinerary(trip.id, { mode, date: current.date, baseVersion: base, minutes: mode === 'late' ? 60 : undefined }))}
              className="flex min-h-[2.5rem] items-center gap-1.5 rounded-pill border border-line bg-paper px-3 text-sm text-ink disabled:opacity-50"
            >
              <Icon size={14} /> {label}
            </button>
          ))}
          <button disabled={busy} onClick={() => setAdding(true)} className="flex min-h-[2.5rem] items-center gap-1.5 rounded-pill border border-line bg-paper px-3 text-sm text-ink">
            <Plus size={14} /> Add something
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}
      {last?.changed && last.changes && (
        <div className="rounded-md border border-ok/40 bg-mint px-4 py-3 text-sm text-ink" role="status">
          <p className="font-medium">Updated: {last.changes.join(' · ')}</p>
          <button onClick={() => void run(() => undoItinerary(trip.id, base)).then(() => setLast(null))} className="mt-1 flex min-h-tap items-center gap-1 font-medium underline underline-offset-4">
            <Undo2 size={14} /> Undo
          </button>
        </div>
      )}
      {last?.warnings.map((w) => (
        <p key={w.itemId} className="rounded-md bg-rose px-4 py-2 text-sm text-ink">
          {w.message}{' '}
          <Link to={`/trips/${trip.id}/bookings/${w.bookingId}`} className="font-medium underline underline-offset-4">
            Cancel / refund
          </Link>
        </p>
      ))}
      {last?.emergency && (
        <div className="rounded-lg border border-bad/30 bg-rose p-4 text-sm text-ink">
          <p className="font-medium">Take care. Help nearby:</p>
          <p className="mt-1">
            Emergency in {last.emergency.country}: <span className="font-semibold">{last.emergency.numbers.all ?? last.emergency.numbers.ambulance}</span>
            {last.emergency.numbers.ambulance && last.emergency.numbers.all && ` · ambulance ${last.emergency.numbers.ambulance}`}
          </p>
          <p className="mt-1 flex gap-4">
            <a href={last.emergency.pharmacy} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Nearest pharmacy
            </a>
            <a href={last.emergency.hospital} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Nearest hospital
            </a>
          </p>
        </div>
      )}

      {/* The day */}
      <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{fmtDay(current.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h2 className="mt-1 text-2xl">{current.title}</h2>
        <p className="text-xs text-muted">
          About {inr(dayCost)} per person today (estimate){current.rainLikely && ' · rain likely, indoor plans first'}
        </p>
        <ol className="mt-4 space-y-2">
          {visible.map((it) => {
            const Icon = ICON[it.type];
            const off = it.status !== 'planned';
            return (
              <li key={it.id} className={`flex items-start gap-3 rounded-md px-2 py-2 ${off ? 'opacity-50' : ''} ${it.locked ? 'bg-sand/60' : ''}`}>
                <span className="w-12 shrink-0 pt-1 text-sm font-semibold tabular-nums text-espresso">{it.start}</span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lavender">
                  <Icon size={16} className="text-ink" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm text-ink ${off ? 'line-through' : ''}`}>
                    {it.link ? (
                      <a href={it.link} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                        {it.title}
                      </a>
                    ) : (
                      it.title
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-muted">
                    <span>until {it.end}</span>
                    {it.travelMinFromPrev > 0 && <span>· {it.travelMinFromPrev} min away</span>}
                    {it.type !== 'rest' && <span>· {it.costPerPerson ? `~${inr(it.costPerPerson)} pp` : 'free'}</span>}
                    {it.type === 'experience' && <span>· {it.indoor ? 'indoors' : 'outdoors'}</span>}
                    {it.type === 'experience' && <span aria-label={`effort ${it.intensity} of 5`}>· {'●'.repeat(it.intensity)}{'○'.repeat(5 - it.intensity)}</span>}
                    {off && <span>· {it.status}</span>}
                  </span>
                </span>
                {!off && (
                  <span className="flex shrink-0 gap-1">
                    <button aria-label={it.locked ? `Unlock ${it.title}` : `Lock ${it.title}`} onClick={() => void run(() => lockItem(trip.id, it.id, !it.locked, base))} className="grid h-9 w-9 place-items-center rounded-full text-espresso">
                      {it.locked ? <Lock size={15} /> : <LockOpen size={15} />}
                    </button>
                    {!it.locked && (
                      <button aria-label={`Skip ${it.title}`} onClick={() => void run(() => adaptItinerary(trip.id, { mode: 'skip', date: current.date, itemId: it.id, baseVersion: base }))} className="grid h-9 w-9 place-items-center rounded-full text-espresso">
                        <SkipForward size={15} />
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {current.items.length === 0 && <p className="mt-3 text-sm text-muted">Free day. Add something, or keep it open.</p>}
      </div>

      {plan.postponed.length > 0 && (
        <div className="rounded-md border border-dashed border-line px-4 py-3 text-sm">
          <p className="font-medium text-ink">Postponed</p>
          <p className="text-espresso">{plan.postponed.map((p) => p.title).join(', ')}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a href={`/api/itineraries/${trip.id}/export/pdf`} className="flex min-h-tap items-center justify-center gap-1.5 rounded-pill border border-line bg-paper text-sm font-medium text-ink">
          <FileDown size={15} /> PDF
        </a>
        <a href={`/api/itineraries/${trip.id}/export/ics`} className="flex min-h-tap items-center justify-center gap-1.5 rounded-pill border border-line bg-paper text-sm font-medium text-ink">
          <CalendarPlus size={15} /> Calendar
        </a>
      </div>
      <p className="-mt-2 text-center text-[0.6875rem] text-muted">The calendar file imports into Google Calendar, Apple and Outlook.</p>
      <div className="flex justify-between">
        <button onClick={() => setHistory(!history)} className="flex min-h-tap items-center gap-1 text-sm text-espresso underline underline-offset-4">
          <History size={14} /> Changes (v{base})
        </button>
        <button disabled={busy} onClick={() => void run(() => generateItinerary(trip.id))} className="flex min-h-tap items-center gap-1 text-sm text-espresso underline underline-offset-4">
          <RefreshCw size={14} /> Rebuild plan
        </button>
      </div>
      {history && (
        <ol className="space-y-2 text-sm">
          {v.versions?.map((h) => (
            <li key={h.version} className="rounded-md border border-line bg-paper px-3 py-2">
              <span className="font-medium text-ink">
                v{h.version} · {h.reason}
              </span>
              <span className="block text-xs text-muted">{h.changes.slice(0, 4).join(' · ')}</span>
            </li>
          ))}
        </ol>
      )}

      {adding && guide && (
        <Sheet open onClose={() => setAdding(false)} title={`Add to ${fmtDay(current.date, { weekday: 'long' })}`}>
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto pb-4">
            {[...guide.see.map((p) => ({ id: `see-${p.id}`, name: p.name, sub: p.category })), ...guide.eat.map((p) => ({ id: `eat-${p.id}`, name: p.name, sub: p.cuisine ?? 'food' }))].map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setAdding(false);
                    void run(() => adaptItinerary(trip.id, { mode: 'add', date: current.date, placeId: p.id, baseVersion: base }));
                  }}
                  className="flex min-h-tap w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-sand"
                >
                  <span className="text-ink">{p.name}</span>
                  <span className="text-xs capitalize text-muted">{p.sub?.replace(/_/g, ' ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
