import { useEffect, useMemo, useState } from 'react';
import { Bike, Bus, Car, CarTaxiFront, ExternalLink, Footprints } from 'lucide-react';
import { api } from '../../api/client';
import { TagCard } from '../cards/TagCard';
import { inr } from '../../utils/format';
import type { Guide } from '../../hooks/useGuide';
import type { Booking, Trip } from '../../types';
import type { Pastel } from '../../design/tokens';

interface Point {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface RideOption {
  mode: 'bike' | 'auto' | 'cab' | 'cab-xl' | 'transit' | 'walk';
  label: string;
  provider: string;
  fareRange: [number, number] | null;
  minutes: number;
  seats: number;
  link: string;
  note?: string;
}

const look: Record<RideOption['mode'], { Icon: typeof Car; pastel: Pastel }> = {
  walk: { Icon: Footprints, pastel: 'mint' },
  transit: { Icon: Bus, pastel: 'sky' },
  bike: { Icon: Bike, pastel: 'butter' },
  auto: { Icon: CarTaxiFront, pastel: 'peach' },
  cab: { Icon: Car, pastel: 'lavender' },
  'cab-xl': { Icon: Car, pastel: 'rose' },
};

const enc = (p: Point) => `${p.lat},${p.lon},${encodeURIComponent(p.name)}`;

/** Ways to get from A to B in the trip's city, cheapest first, with links to book them. */
export function RidePlanner({ trip, guide, bookings }: { trip: Trip; guide: Guide; bookings: Booking[] }) {
  const [airport, setAirport] = useState<Point | null>(null);
  useEffect(() => {
    if (!guide.destination.airportIata) return;
    api<{ airport: { iata: string; name: string; lat: number; lon: number } }>('GET', `/airports/${guide.destination.airportIata}`)
      .then(({ airport: a }) => setAirport({ id: 'airport', name: `${a.iata} airport`, lat: a.lat, lon: a.lon }))
      .catch(() => setAirport(null));
  }, [guide.destination.airportIata]);

  // Places the traveller is likely to move between.
  const points = useMemo(() => {
    const list: Point[] = [];
    if (airport) list.push(airport);
    for (const b of bookings) {
      if (b.kind === 'hotel' && b.details?.lat != null && b.details?.lon != null) list.push({ id: `stay-${b.id}`, name: b.title, lat: b.details.lat, lon: b.details.lon });
    }
    list.push({ id: 'centre', name: `${guide.destination.name} centre`, lat: guide.destination.lat, lon: guide.destination.lon });
    for (const s of guide.see.slice(0, 8)) if (s.lat != null && s.lon != null) list.push({ id: `see-${s.id}`, name: s.name, lat: s.lat, lon: s.lon });
    return list;
  }, [airport, bookings, guide]);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  useEffect(() => {
    // Default: arriving at the airport and heading to the stay (or the centre).
    if (!fromId && points.length > 1) setFromId(points[0].id);
    if (!toId && points.length > 1) setToId(points.find((p) => p.id.startsWith('stay-'))?.id ?? points.find((p) => p.id === 'centre')!.id);
  }, [points, fromId, toId]);

  const from = points.find((p) => p.id === fromId);
  const to = points.find((p) => p.id === toId);
  const [result, setResult] = useState<{ km: number; options: RideOption[]; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to || from.id === to.id) return setResult(null);
    setError(null);
    api<{ km: number; options: RideOption[]; note: string }>('GET', `/transport/options?from=${enc(from)}&to=${enc(to)}&india=${guide.destination.isDomestic ? 1 : 0}&travellers=${trip.travellers}`)
      .then(setResult)
      .catch(() => setError('Could not work out the options. Check your connection.'));
  }, [from, to, guide.destination.isDomestic, trip.travellers]);

  const select = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-espresso">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-tap w-full rounded-md border border-line bg-paper px-3 text-base text-ink outline-none focus:border-ink">
        {points.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="space-y-3">
      <h2 className="text-xl">Getting around {guide.destination.name}</h2>
      <div className="grid grid-cols-2 gap-3">
        {select('From', fromId, setFromId)}
        {select('To', toId, setToId)}
      </div>
      {from && to && from.id === to.id && <p className="text-sm text-muted">Pick two different places.</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
      {result && (
        <>
          <p className="text-xs text-muted">
            About {result.km} km by road · for {trip.travellers} {trip.travellers === 1 ? 'traveller' : 'travellers'} · cheapest first
          </p>
          {result.options.map((o, i) => {
            const { Icon, pastel } = look[o.mode];
            return (
              <TagCard key={`${o.mode}-${o.provider}-${i}`} pastel={pastel} side={<Icon size={20} />}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-lg leading-tight text-ink">{o.label}</p>
                  <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                    {o.fareRange ? (o.fareRange[1] === 0 ? 'Free' : `${inr(o.fareRange[0])}–${inr(o.fareRange[1])}`) : 'See app'}
                  </p>
                </div>
                <p className="mt-1 text-sm text-espresso">
                  {o.provider} · about {o.minutes} min{o.seats < 99 ? ` · up to ${o.seats} people` : ''}
                </p>
                {o.note && <p className="mt-1 text-xs text-muted">{o.note}</p>}
                <a href={o.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-[2.25rem] items-center gap-1 text-sm font-medium text-ink underline underline-offset-4">
                  Open {o.provider.split(' / ')[0]} <ExternalLink size={13} />
                </a>
              </TagCard>
            );
          })}
          <p className="text-xs text-muted">{result.note}</p>
        </>
      )}
    </section>
  );
}
