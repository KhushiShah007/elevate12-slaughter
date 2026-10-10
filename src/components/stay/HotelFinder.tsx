import { useEffect, useMemo, useState } from 'react';
import { Bookmark, CalendarDays, ExternalLink, Home, MapPin, Search, Star, Trash2, UsersRound } from 'lucide-react';
import { Input } from '../ui/Input';
import { PillButton } from '../ui/PillButton';
import { Chip } from '../ui/Chip';
import { Segmented } from '../ui/Segmented';
import { api, ApiError } from '../../api/client';
import { loadDestinations } from '../../hooks/useDestinations';
import { usePersona } from '../../hooks/usePersona';
import { removeOption, saveOption } from '../../db/repos/bookings';
import { inr } from '../../utils/format';
import { PayHelp } from '../guide/PayHelp';
import { BookSheet } from '../pay/BookSheet';
import type { Booking, Trip } from '../../types';

interface Offer {
  id: string;
  live: boolean;
  name: string;
  lat: number | null;
  lon: number | null;
  kind: string;
  stars: number | null;
  address: string | null;
  pricePerNight: number;
  priceRange: [number, number] | null;
  priceIsEstimate: boolean;
  totalInr: number;
  roomDescription: string | null;
  cancellation: string | null;
  bookUrl: string;
  mapUrl: string | null;
}

interface Result {
  provider: string;
  live: boolean;
  nights: number;
  offers: Offer[];
  note: string;
  source: { name: string; url: string; license?: string };
  links: { airbnb: string; booking: string };
}

const kindLabel: Record<string, string> = { hotel: 'Hotel', hostel: 'Hostel', guest_house: 'Guesthouse', motel: 'Motel', apartment: 'Apartment', resort: 'Resort' };
const perNight = (o: Offer) => (o.priceRange ? `${inr(o.priceRange[0])}–${inr(o.priceRange[1])}` : inr(o.pricePerNight));

/** Find stays for a trip's destination and save options to the trip. */
export function HotelFinder({ trip, saved }: { trip: Trip; saved: Booking[] }) {
  const persona = usePersona();
  const today = new Date().toISOString().slice(0, 10);
  const [slug, setSlug] = useState<string | null | undefined>(trip.destinationSlug ?? undefined);
  const [checkIn, setCheckIn] = useState(trip.startDate.slice(0, 10) >= today ? trip.startDate.slice(0, 10) : today);
  const [checkOut, setCheckOut] = useState(trip.endDate.slice(0, 10) > checkIn ? trip.endDate.slice(0, 10) : '');
  const [rooms, setRooms] = useState(Math.max(1, Math.ceil(trip.travellers / 2)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // Savers see the cheapest first; everyone else, the best-rated first.
  const [order, setOrder] = useState<'price' | 'class'>('class');
  useEffect(() => {
    if (persona?.fromQuiz) setOrder(persona.persona.id === 'saver' ? 'price' : 'class');
  }, [persona?.fromQuiz, persona?.persona.id]);

  // Trips made before the destination catalogue only know the city name.
  useEffect(() => {
    if (slug !== undefined) return;
    void loadDestinations()
      .then((list) => setSlug(list.find((d) => d.name.toLowerCase() === trip.to.toLowerCase())?.slug ?? null))
      .catch(() => setSlug(null));
  }, [slug, trip.to]);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<Result>('GET', `/hotels/search?slug=${slug}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${trip.travellers}&rooms=${rooms}`, undefined, 40_000));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Search failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const offers = useMemo(() => {
    const list = [...(result?.offers ?? [])];
    return order === 'price' ? list.sort((a, b) => a.pricePerNight - b.pricePerNight) : list.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || b.pricePerNight - a.pricePerNight);
  }, [result, order]);

  const save = async (o: Offer) => {
    const nights = result!.nights;
    await saveOption(trip.id, 'hotel', o.name, o.totalInr, {
      provider: result!.provider,
      live: o.live,
      priceIsEstimate: o.priceIsEstimate,
      priceRange: o.priceRange ? [o.priceRange[0] * nights * rooms, o.priceRange[1] * nights * rooms] : null,
      bookUrl: o.bookUrl,
      lat: o.lat,
      lon: o.lon,
      summary: `${checkIn} → ${checkOut} · ${nights} ${nights === 1 ? 'night' : 'nights'} · ${rooms} ${rooms === 1 ? 'room' : 'rooms'}`,
    });
    setSavedIds((s) => new Set(s).add(o.id));
  };

  const [toBook, setToBook] = useState<Booking | null>(null);
  const options = saved.filter((b) => b.kind === 'hotel' && b.status === 'suggested');

  if (slug === null)
    return (
      <section className="space-y-2">
        <h2 className="text-xl">Find a stay</h2>
        <p className="text-sm text-muted">Stay search works for the destinations in Explore. “{trip.to}” is not one of them yet.</p>
      </section>
    );

  return (
    <section className="space-y-4">
      <h2 className="text-xl">Find a stay in {trip.to}</h2>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Check-in" icon={<CalendarDays size={18} />} type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} error={error?.fields.checkIn} />
        <Input label="Check-out" icon={<CalendarDays size={18} />} type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} error={error?.fields.checkOut} />
      </div>
      <Input
        label={`Rooms for ${trip.travellers} ${trip.travellers === 1 ? 'traveller' : 'travellers'}`}
        icon={<UsersRound size={18} />}
        type="number"
        min={1}
        max={10}
        value={String(rooms)}
        onChange={(e) => setRooms(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
      />
      {error && !Object.keys(error.fields).length && <p className="text-sm text-bad">{error.message}</p>}
      <PillButton full icon={<Search size={18} />} disabled={!slug || !checkIn || !checkOut || busy} onClick={() => void search()}>
        {busy ? 'Searching…' : 'Search stays'}
      </PillButton>

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {result.live ? (
              <Chip tone="ok" dot>
                Live prices
              </Chip>
            ) : (
              <Chip tone="warn" dot>
                Estimated prices
              </Chip>
            )}
            <span className="text-xs text-muted">
              {result.source.name}
              {result.source.license && ` · ${result.source.license}`}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-espresso">{result.note}</p>
          <Segmented
            value={order}
            onChange={setOrder}
            options={[
              { value: 'class', label: 'Best rated' },
              { value: 'price', label: 'Lowest price' },
            ]}
          />
          {offers.map((o) => (
            <article key={o.id} className="rounded-lg border border-line bg-paper p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg leading-tight text-ink">{o.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-espresso">
                    <span>{kindLabel[o.kind] ?? 'Stay'}</span>
                    {o.stars != null && (
                      <span className="flex items-center gap-0.5">
                        {o.stars} <Star size={12} className="fill-current" />
                      </span>
                    )}
                    {o.address && <span className="truncate">{o.address}</span>}
                  </p>
                  {o.roomDescription && <p className="mt-1 text-xs text-muted">{o.roomDescription}</p>}
                  {o.cancellation && <p className="mt-1 text-xs text-ok">{o.cancellation}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium tabular-nums text-ink">{perNight(o)}</p>
                  <p className="text-[0.6875rem] text-muted">{o.priceIsEstimate ? 'estimate / night' : 'per night'}</p>
                  <p className="mt-1 text-xs tabular-nums text-espresso">
                    {o.priceIsEstimate ? '~' : ''}
                    {inr(o.totalInr)} total
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => void save(o)}
                  disabled={savedIds.has(o.id)}
                  className="flex min-h-tap items-center gap-1.5 rounded-pill border border-line px-4 text-sm font-medium text-ink disabled:opacity-60"
                >
                  <Bookmark size={16} /> {savedIds.has(o.id) ? 'Saved' : 'Save to trip'}
                </button>
                <a href={o.bookUrl} target="_blank" rel="noreferrer" className="flex min-h-tap items-center gap-1 px-2 text-sm text-espresso underline underline-offset-4">
                  Booking.com <ExternalLink size={14} />
                </a>
                {o.mapUrl && (
                  <a href={o.mapUrl} target="_blank" rel="noreferrer" className="flex min-h-tap items-center gap-1 px-2 text-sm text-espresso underline underline-offset-4">
                    Map <MapPin size={14} />
                  </a>
                )}
              </div>
            </article>
          ))}
          <a
            href={result.links.airbnb}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-tap items-center justify-center gap-2 rounded-pill border border-dashed border-line px-4 text-sm font-medium text-espresso"
          >
            <Home size={16} /> Prefer a home? Search Airbnb for these dates <ExternalLink size={14} />
          </a>
        </div>
      )}

      {options.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-lg">Saved stays</h3>
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
                <button onClick={() => setToBook(b)} className="min-h-tap rounded-pill bg-ink px-3 text-xs font-medium text-ivory">
                  Book
                </button>
                <button onClick={() => void removeOption(b)} aria-label={`Remove ${b.title}`} className="grid min-h-tap min-w-[2.75rem] place-items-center text-muted">
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
          ))}
          <p className="text-xs text-muted">Saved stays are not bookings until you tap Book (test mode) or book on the hotel’s site.</p>
          <p className="pt-1 text-xs font-medium text-ink">Pay less on the cheapest saved option ({inr(Math.min(...options.map((o) => o.amount)))}):</p>
          <PayHelp amount={Math.min(...options.map((o) => o.amount))} kind="hotel" />
        </div>
      )}
      {toBook && <BookSheet trip={trip} booking={toBook} onClose={() => setToBook(null)} onBooked={() => undefined} />}
    </section>
  );
}
