import { useEffect, useState } from 'react';
import { Bookmark, CalendarDays, ExternalLink, PlaneLanding, PlaneTakeoff, Search, Trash2 } from 'lucide-react';
import { AirportField, airportForCity } from './AirportField';
import { Input } from '../ui/Input';
import { PillButton } from '../ui/PillButton';
import { Chip } from '../ui/Chip';
import { api, ApiError } from '../../api/client';
import { loadDestinations } from '../../hooks/useDestinations';
import { removeOption, saveOption } from '../../db/repos/bookings';
import { useAuth } from '../../state/auth';
import { duration, inr } from '../../utils/format';
import type { Booking, Trip } from '../../types';

interface Offer {
  id: string;
  live: boolean;
  airlines: { iata: string; name: string }[];
  flightNumbers: string[];
  from: string;
  to: string;
  via: string[];
  stops: number;
  departAt: string | null;
  arriveAt: string | null;
  durationMin: number;
  priceInr: number;
  priceRange: [number, number] | null;
  priceIsEstimate: boolean;
  bookUrl: string;
}

interface Result {
  provider: string;
  live: boolean;
  offers: Offer[];
  note: string;
  source: { name: string; url: string; license?: string };
}

const time = (iso: string) => iso.slice(11, 16);
const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
const route = (o: Offer) => [o.from, ...o.via, o.to].join(' → ');
const price = (o: Offer) => (o.priceRange ? `${inr(o.priceRange[0])}–${inr(o.priceRange[1])}` : inr(o.priceInr));

/** Search flights for a trip, compare, and save options to it. */
export function FlightFinder({ trip, saved }: { trip: Trip; saved: Booking[] }) {
  const { me } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(trip.startDate.slice(0, 10) >= today ? trip.startDate.slice(0, 10) : today);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Sensible starting airports: home city (or the trip's "from") and the destination's airport.
  useEffect(() => {
    void airportForCity(trip.from || me?.homeCity || '').then((a) => a && setFrom((f) => f || a.iata));
    void loadDestinations()
      .then((list) => {
        const d = list.find((x) => x.slug === trip.destinationSlug) ?? list.find((x) => x.name.toLowerCase() === trip.to.toLowerCase());
        if (d?.airportIata) setTo((t) => t || d.airportIata!);
      })
      .catch(() => undefined);
  }, [trip.from, trip.to, trip.destinationSlug, me?.homeCity]);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<Result>('GET', `/flights/search?from=${from}&to=${to}&date=${date}&adults=${trip.travellers}`, undefined, 30_000));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Search failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const save = async (o: Offer) => {
    const names = o.airlines.map((a) => titleCase(a.name)).join(' + ');
    await saveOption(trip.id, 'flight', `${names} · ${route(o)}`, o.priceInr * trip.travellers, {
      provider: result?.provider ?? 'unknown',
      live: o.live,
      priceIsEstimate: o.priceIsEstimate,
      priceRange: o.priceRange ? [o.priceRange[0] * trip.travellers, o.priceRange[1] * trip.travellers] : null,
      bookUrl: o.bookUrl,
      summary: `${date}${o.departAt ? ` · ${time(o.departAt)}–${time(o.arriveAt!)}` : ''} · ${o.stops ? `${o.stops} stop` : 'direct'} · ~${duration(o.durationMin)}`,
    });
    setSavedIds((s) => new Set(s).add(o.id));
  };

  const options = saved.filter((b) => b.kind === 'flight' && b.status === 'suggested');

  return (
    <section className="space-y-4">
      <h2 className="text-xl">Find flights</h2>
      <div className="grid grid-cols-2 gap-3">
        <AirportField label="From" icon={<PlaneTakeoff size={18} />} value={from} onChange={setFrom} error={error?.fields.from} />
        <AirportField label="To" icon={<PlaneLanding size={18} />} value={to} onChange={setTo} error={error?.fields.to} />
      </div>
      <Input label="Date" icon={<CalendarDays size={18} />} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} error={error?.fields.date} />
      {error && !Object.keys(error.fields).length && <p className="text-sm text-bad">{error.message}</p>}
      <PillButton full icon={<Search size={18} />} disabled={!from || !to || !date || busy} onClick={() => void search()}>
        {busy ? 'Searching…' : `Search for ${trip.travellers} ${trip.travellers === 1 ? 'traveller' : 'travellers'}`}
      </PillButton>

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {result.live ? (
              <Chip tone="ok" dot>
                Live fares
              </Chip>
            ) : (
              <Chip tone="warn" dot>
                Indicative
              </Chip>
            )}
            <span className="text-xs text-muted">
              {result.source.name}
              {result.source.license && ` · ${result.source.license}`}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-espresso">{result.note}</p>
          {result.offers.map((o) => (
            <article key={o.id} className="rounded-lg border border-line bg-paper p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg leading-tight text-ink">{o.airlines.map((a) => titleCase(a.name)).join(' + ')}</p>
                  <p className="text-sm text-espresso">
                    {route(o)} · {o.stops ? `${o.stops} stop` : 'direct'}
                  </p>
                  <p className="text-xs text-muted">
                    {o.departAt ? `${time(o.departAt)} → ${time(o.arriveAt!)} · ` : 'Times not known · '}
                    {o.priceIsEstimate ? '~' : ''}
                    {duration(o.durationMin)}
                    {o.flightNumbers.length > 0 && ` · ${o.flightNumbers.join(', ')}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium tabular-nums text-ink">{price(o)}</p>
                  <p className="text-[0.6875rem] text-muted">{o.priceIsEstimate ? 'estimate / person' : 'per person'}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void save(o)}
                  disabled={savedIds.has(o.id)}
                  className="flex min-h-tap items-center gap-1.5 rounded-pill border border-line px-4 text-sm font-medium text-ink disabled:opacity-60"
                >
                  <Bookmark size={16} /> {savedIds.has(o.id) ? 'Saved' : 'Save to trip'}
                </button>
                <a href={o.bookUrl} target="_blank" rel="noreferrer" className="flex min-h-tap items-center gap-1.5 rounded-pill px-3 text-sm text-espresso underline underline-offset-4">
                  Check fares <ExternalLink size={14} />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      {options.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-lg">Saved options</h3>
          {options.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{b.title}</span>
                <span className="block truncate text-xs text-muted">
                  {b.details?.summary}
                  {b.details?.priceIsEstimate ? ' · estimate' : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="tabular-nums text-ink">
                  {b.details?.priceRange ? `${inr(b.details.priceRange[0])}–${inr(b.details.priceRange[1])}` : inr(b.amount)}
                </span>
                <button onClick={() => void removeOption(b)} aria-label={`Remove ${b.title}`} className="grid min-h-tap min-w-[2.75rem] place-items-center text-muted">
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
          ))}
          <p className="text-xs text-muted">Totals are for all {trip.travellers} travellers. Saved options are not bookings.</p>
        </div>
      )}
    </section>
  );
}
