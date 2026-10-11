import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTrip } from '../../hooks/useTrip';
import { useGuide } from '../../hooks/useGuide';
import { usePersona } from '../../hooks/usePersona';
import { defaultPersona } from '../../engines/persona';
import { generatePacking, mergePacking, PACK_CATEGORIES, type PackItem } from '../../engines/packing';
import { db, type PackingList } from '../../db/db';
import { writeAndQueue } from '../../db/syncQueue';
import { api } from '../../api/client';
import { PageHeader } from '../../components/layout/PageHeader';
import NotFound from '../NotFound';

interface DayWeather {
  date: string;
  maxC: number | null;
  minC: number | null;
  summary: string;
  rainy: boolean;
}
interface TripWeather {
  kind: 'forecast' | 'typical';
  days: DayWeather[];
  source: string;
}

/** Weather for the trip's own dates: forecast when close, otherwise the same dates last year. */
export function useTripWeather(slug: string | undefined, start: string | undefined, end: string | undefined) {
  const [w, setW] = useState<TripWeather | null | undefined>(undefined);
  useEffect(() => {
    if (!slug || !start) return;
    let alive = true;
    api<{ weather: TripWeather | null }>('GET', `/destinations/${slug}/trip-weather?start=${start}&end=${end ?? start}`, undefined, 20_000)
      .then((r) => alive && setW(r.weather))
      .catch(() => alive && setW(null));
    return () => {
      alive = false;
    };
  }, [slug, start, end]);
  return w;
}

export function summarise(w: TripWeather | null | undefined) {
  if (!w?.days.length) return null;
  const maxes = w.days.map((d) => d.maxC).filter((x): x is number => x != null);
  const mins = w.days.map((d) => d.minC).filter((x): x is number => x != null);
  const rainyDays = w.days.filter((d) => d.rainy).length;
  return {
    maxC: maxes.length ? Math.max(...maxes) : null,
    minC: mins.length ? Math.min(...mins) : null,
    rainy: rainyDays > 0,
    text: `${mins.length ? Math.min(...mins) : '–'}–${maxes.length ? Math.max(...maxes) : '–'}°C${rainyDays ? ` · rain on ${rainyDays} ${rainyDays === 1 ? 'day' : 'days'}` : ' · mostly dry'}`,
    label: w.kind === 'forecast' ? 'Forecast' : 'Typical for these dates',
  };
}

export default function Packing() {
  const { tripId } = useParams();
  const data = useTrip(tripId);
  const trip = data?.trip;
  const { guide } = useGuide(trip);
  const persona = usePersona();
  const saved = useLiveQuery(() => (tripId ? db.packingLists.get(tripId) : undefined), [tripId]);
  const weather = useTripWeather(guide?.destination.slug, trip?.startDate, trip?.endDate);
  const wx = summarise(weather);
  const [newItem, setNewItem] = useState('');
  // Shown at once on tap; the saved copy catches up (and wins when another device changes it).
  const [local, setLocal] = useState<PackItem[] | null>(null);
  useEffect(() => setLocal(null), [saved?.updatedAt]);

  const fresh = useMemo(() => {
    if (!trip) return [];
    const days = Math.max(1, Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000) + 1) || 1;
    return generatePacking({
      days,
      travellers: trip.travellers ?? 1,
      international: guide ? !guide.destination.isDomestic : false,
      weather: wx ? { maxC: wx.maxC, minC: wx.minC, rainy: wx.rainy } : null,
      persona: persona?.persona ?? defaultPersona(),
    });
  }, [trip, guide, wx?.maxC, wx?.minC, wx?.rainy, persona]);

  if (data === undefined) return null;
  if (!data || !trip) return <NotFound />;

  const items: PackItem[] = local ?? saved?.items ?? fresh;
  const save = (next: PackItem[], label: string) => {
    setLocal(next);
    const list: PackingList = { id: trip.id, tripId: trip.id, items: next, updatedAt: new Date().toISOString(), rev: saved?.rev };
    void writeAndQueue('packingLists', trip.id, list, label);
  };
  const toggle = (id: string) => save(items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)), 'Packing list');
  const remove = (id: string) => save(items.filter((i) => i.id !== id), 'Packing list');
  const add = () => {
    const label = newItem.trim().slice(0, 80);
    if (!label) return;
    save([...items, { id: `custom-${crypto.randomUUID()}`, category: 'Misc', label, checked: false, custom: true }], 'Packing list');
    setNewItem('');
  };
  const refresh = () => save(mergePacking(items, fresh), 'Packing list refreshed');
  const done = items.filter((i) => i.checked).length;

  return (
    <div className="pb-10">
      <PageHeader back={`/trips/${trip.id}`} title="Packing list" sub={`${done} of ${items.length} packed`} />
      <div className="px-gutter">
        <div className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
          {weather === undefined ? (
            <span className="text-muted">Checking the weather for your dates…</span>
          ) : wx ? (
            <>
              <span className="font-medium text-ink">{wx.label}:</span> {wx.text}
              <span className="block text-xs text-muted">{weather?.source}</span>
            </>
          ) : (
            <span className="text-muted">Weather not available; the list covers the basics.</span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full bg-ink transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>

        {PACK_CATEGORIES.map((cat) => {
          const inCat = items.filter((i) => i.category === cat);
          if (!inCat.length) return null;
          return (
            <section key={cat} className="pt-5">
              <h2 className="mb-2 text-lg">{cat}</h2>
              <ul className="divide-y divide-line rounded-md border border-line bg-paper">
                {inCat.map((i) => (
                  <li key={i.id} className="flex min-h-tap items-center gap-3 px-4 py-2 text-sm">
                    <label className="flex flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={i.checked} onChange={() => toggle(i.id)} className="h-5 w-5 accent-ink" />
                      <span className={i.checked ? 'text-muted line-through' : 'text-ink'}>{i.label}</span>
                    </label>
                    <button type="button" onClick={() => remove(i.id)} aria-label={`Remove ${i.label}`} className="p-2 text-muted">
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <form
          className="flex gap-2 pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item" maxLength={80} className="min-h-tap flex-1 rounded-md border border-line bg-paper px-3 text-sm" />
          <button type="submit" className="flex min-h-tap items-center gap-1 rounded-md bg-ink px-4 text-sm text-paper">
            <Plus size={16} /> Add
          </button>
        </form>
        <button type="button" onClick={refresh} className="mt-4 flex items-center gap-2 text-sm text-ink underline underline-offset-4">
          <RefreshCw size={14} /> Refresh from weather and trip (keeps your ticks)
        </button>
      </div>
    </div>
  );
}

/** Workspace row: packing progress plus the weather for the trip's dates. */
export function PackingLink({ tripId, slug, start, end }: { tripId: string; slug?: string | null; start: string; end: string }) {
  const saved = useLiveQuery(() => db.packingLists.get(tripId), [tripId]);
  const wx = summarise(useTripWeather(slug ?? undefined, start, end));
  const done = saved?.items.filter((i) => i.checked).length ?? 0;
  return (
    <section className="px-gutter pt-6">
      <Link to={`/trips/${tripId}/packing`} className="flex min-h-tap items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3 text-sm">
        <span className="min-w-0">
          <span className="block font-medium text-ink">Packing list</span>
          <span className="block text-xs text-muted">
            {saved ? `${done} of ${saved.items.length} packed` : 'Made from your trip and the weather'}
            {wx ? ` · ${wx.text}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-ink underline underline-offset-4">Open</span>
      </Link>
    </section>
  );
}
