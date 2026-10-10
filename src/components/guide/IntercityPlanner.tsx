import { useEffect, useState } from 'react';
import { Bookmark, Bus, Car, ExternalLink, Plane, TrainFront } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { airportForCity } from '../flight/AirportField';
import { TagCard } from '../cards/TagCard';
import { Chip } from '../ui/Chip';
import { saveOption } from '../../db/repos/bookings';
import { useAuth } from '../../state/auth';
import { duration, inr } from '../../utils/format';
import type { Guide } from '../../hooks/useGuide';
import type { Trip } from '../../types';
import type { Pastel } from '../../design/tokens';

interface Option {
  mode: 'flight' | 'train' | 'bus' | 'car';
  title: string;
  provider: string;
  durationMin: number;
  priceInr: number;
  priceIsEstimate: boolean;
  link: string;
  note?: string;
  badges: ('cheapest' | 'fastest')[];
}
interface Result {
  from: { iata: string; city: string };
  to: { iata: string; city: string };
  km: number;
  options: Option[];
  more: string;
  note: string;
}

const LOOK: Record<Option['mode'], { Icon: typeof Plane; pastel: Pastel }> = {
  flight: { Icon: Plane, pastel: 'sky' },
  train: { Icon: TrainFront, pastel: 'mint' },
  bus: { Icon: Bus, pastel: 'butter' },
  car: { Icon: Car, pastel: 'peach' },
};

/** Getting to the destination: flight, train, bus or road, cheapest and fastest marked. */
export function IntercityPlanner({ trip, guide }: { trip: Trip; guide: Guide }) {
  const { me } = useAuth();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [rentals, setRentals] = useState<{ provider: string; url: string; note?: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const from = await airportForCity(trip.from || me?.homeCity || '');
      const to = guide.destination.airportIata;
      if (!from || !to) return alive && setError(trip.from || me?.homeCity ? null : 'Add where you start from (your home city in Me, or the trip’s From) to compare ways to get there.');
      if (from.iata === to) return;
      try {
        const r = await api<Result>('GET', `/transport/intercity?from=${from.iata}&to=${to}&date=${trip.startDate.slice(0, 10)}&travellers=${trip.travellers}`, undefined, 30_000);
        if (alive) setResult(r);
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : 'Could not compare routes.');
      }
    })();
    api<{ options: { provider: string; url: string; note?: string }[] }>('GET', `/transport/rentals?city=${encodeURIComponent(guide.destination.name)}&india=${guide.destination.isDomestic ? 1 : 0}`)
      .then((r) => alive && setRentals(r.options))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [trip.from, trip.startDate, trip.travellers, me?.homeCity, guide.destination.airportIata, guide.destination.name, guide.destination.isDomestic]);

  const save = async (o: Option) => {
    await saveOption(trip.id, 'transport', `${o.title} · ${result!.from.city} → ${result!.to.city}`, o.priceInr, {
      provider: o.provider,
      live: !o.priceIsEstimate,
      priceIsEstimate: o.priceIsEstimate,
      bookUrl: o.link,
      summary: `${trip.startDate.slice(0, 10)} · about ${duration(o.durationMin)} · ${trip.travellers} ${trip.travellers === 1 ? 'person' : 'people'}`,
    });
    setSaved((s) => new Set(s).add(o.mode));
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xl">Getting to {guide.destination.name}</h2>
      {error && <p className="text-sm text-muted">{error}</p>}
      {result && (
        <>
          <p className="text-xs text-muted">
            {result.from.city} → {result.to.city}, about {result.km} km · totals for {trip.travellers} {trip.travellers === 1 ? 'person' : 'people'}, one way
          </p>
          {result.options.map((o) => {
            const { Icon, pastel } = LOOK[o.mode];
            return (
              <TagCard key={o.mode} pastel={pastel} side={<Icon size={20} />}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-lg leading-tight text-ink">{o.title}</p>
                  <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                    {o.priceIsEstimate ? '~' : ''}
                    {inr(o.priceInr)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-espresso">
                  {o.provider} · about {duration(o.durationMin)}
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {o.badges.includes('cheapest') && <Chip tone="ok">Cheapest</Chip>}
                  {o.badges.includes('fastest') && <Chip tone="ok">Fastest</Chip>}
                  {o.priceIsEstimate && <Chip>Estimate</Chip>}
                </p>
                {o.note && <p className="mt-1 text-xs text-muted">{o.note}</p>}
                <p className="mt-2 flex flex-wrap gap-x-4 text-sm">
                  <button onClick={() => void save(o)} disabled={saved.has(o.mode)} className="inline-flex min-h-[2.25rem] items-center gap-1 font-medium text-ink underline underline-offset-4 disabled:no-underline disabled:opacity-60">
                    <Bookmark size={13} /> {saved.has(o.mode) ? 'Saved to trip' : 'Save to trip'}
                  </button>
                  <a href={o.link} target="_blank" rel="noreferrer" className="inline-flex min-h-[2.25rem] items-center gap-1 text-espresso underline underline-offset-4">
                    {o.mode === 'flight' ? 'Check fares' : o.mode === 'car' ? 'Route' : `Check ${o.provider}`} <ExternalLink size={12} />
                  </a>
                </p>
              </TagCard>
            );
          })}
          <a href={result.more} target="_blank" rel="noreferrer" className="inline-flex min-h-tap items-center gap-1 text-sm text-espresso underline underline-offset-4">
            More routes on Rome2Rio <ExternalLink size={12} />
          </a>
          <p className="text-xs text-muted">{result.note} Saved options appear in Budget and can be booked or cancelled from the trip.</p>
        </>
      )}
      {rentals.length > 0 && (
        <div className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <Car size={14} /> Rent a car in {guide.destination.name}
          </p>
          <ul className="mt-1 space-y-1">
            {rentals.map((r) => (
              <li key={r.provider}>
                <a href={r.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  {r.provider}
                </a>
                {r.note && <span className="text-xs text-muted"> · {r.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
