import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BedDouble, CalendarDays, CloudSun, Coins, Landmark, MapPin, UtensilsCrossed } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';
import { api, ApiError } from '../../api/client';
import { destinationPhoto } from '../../data/photos';
import { inr } from '../../utils/format';
import { usePersona } from '../../hooks/usePersona';
import { defaultPersona } from '../../engines/persona';
import { budgetStyle, budgetStyleLabel, orderEateries, orderPlaces, tripEstimate } from '../../engines/personalize';
import NotFound from '../NotFound';

interface Place {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
  category?: string | null;
  cuisine?: string | null;
  vegetarian?: boolean | null;
  openingHours?: string | null;
  stars?: number | null;
  pricePerNightInr?: number | null;
  priceRange?: [number, number] | null;
  priceIsEstimate?: boolean;
  address?: string | null;
  source: string;
}

interface Detail {
  destination: {
    slug: string;
    name: string;
    country: string;
    description: string | null;
    bestTime: string | null;
    idealDays: number | null;
    tags: string[];
    dailyCostInr: { shoestring: number; moderate: number; comfort: number; luxury: number } | null;
    imageUrl: string | null;
    imageCredit: string | null;
    imageLicense: string | null;
    sourceUrl: string | null;
    currency: string | null;
    isDomestic: boolean;
  };
  attractions: Place[];
  restaurants: Place[];
  hotels: Place[];
}

interface Weather {
  now: { tempC: number; summary: string };
  days: { date: string; maxC: number; minC: number; summary: string; rainChance: number | null }[];
  source: string;
  stale?: boolean;
}

interface Fx {
  rate: number;
  to: string;
  date: string | null;
  source: string;
}

const cacheKey = (slug: string) => `voyage.dest.${slug}`;
const mapLink = (p: Place, city: string) =>
  p.lat != null && p.lon != null
    ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${p.name}, ${city}`)}`;

/** Live data with a cached copy for offline (destination details only). */
function useDetail(slug: string) {
  const [state, setState] = useState<{ data: Detail | null; missing: boolean; offline: boolean }>(() => {
    try {
      const raw = localStorage.getItem(cacheKey(slug));
      return { data: raw ? (JSON.parse(raw) as Detail) : null, missing: false, offline: false };
    } catch {
      return { data: null, missing: false, offline: false };
    }
  });
  useEffect(() => {
    let alive = true;
    api<Detail>('GET', `/destinations/${slug}`)
      .then((data) => {
        if (!alive) return;
        setState({ data, missing: false, offline: false });
        try {
          localStorage.setItem(cacheKey(slug), JSON.stringify(data));
        } catch {
          /* storage full */
        }
      })
      .catch((err) => alive && setState((s) => ({ ...s, missing: err instanceof ApiError && err.status === 404, offline: !(err instanceof ApiError && err.status === 404) })));
    return () => {
      alive = false;
    };
  }, [slug]);
  return state;
}

function Section({ icon, title, note, children }: { icon: React.ReactNode; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-xl">
        {icon} {title}
      </h2>
      {note && <p className="-mt-1 mb-2 text-xs text-muted">{note}</p>}
      {children}
    </section>
  );
}

export default function DestinationDetail() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { data, missing, offline } = useDetail(slug);
  const you = usePersona();
  const persona = you?.persona ?? defaultPersona();
  const style = budgetStyle(persona);
  const [weather, setWeather] = useState<Weather | 'error' | null>(null);
  const [weatherTry, setWeatherTry] = useState(0);
  const [fx, setFx] = useState<Fx | null>(null);

  useEffect(() => {
    setWeather(null);
    api<Weather>('GET', `/destinations/${slug}/weather`, undefined, 25_000)
      .then(setWeather)
      .catch(() => setWeather('error'));
  }, [slug, weatherTry]);
  useEffect(() => {
    const cur = data?.destination.currency;
    if (cur && cur !== 'INR') api<Fx>('GET', `/fx?to=${cur}`).then(setFx).catch(() => setFx(null));
  }, [data?.destination.currency]);

  if (missing) return <NotFound />;
  if (!data) return <PageHeader back title="Loading…" sub={offline ? 'You are offline and this place is not saved on the phone yet.' : undefined} />;

  const d = data.destination;
  // Places that suit the traveller first (veg places first for veg and Jain travellers).
  const sights = orderPlaces(data.attractions, persona);
  const eateries = orderEateries(data.restaurants, persona);
  const photo = destinationPhoto(d.slug);
  const [license, page] = (d.imageLicense ?? '').split(' · ');

  return (
    <div className="pb-10">
      <PageHeader back title={d.name} sub={d.country} source="cloud" />
      <div className="space-y-7 px-gutter">
        <figure>
          <div className="grain overflow-hidden rounded-lg bg-sand shadow-card">
            <img
              src={d.imageUrl ?? photo?.src ?? ''}
              srcSet={photo ? `${photo.src} 500w${d.imageUrl ? `, ${d.imageUrl} 1280w` : ''}` : undefined}
              sizes="(max-width: 480px) 100vw, 440px"
              alt={d.name}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <figcaption className="mt-1.5 text-[0.6875rem] text-muted">
            Photo: {d.imageCredit ?? photo?.credit}
            {license && (
              <>
                {' · '}
                {page ? (
                  <a href={page} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {license}
                  </a>
                ) : (
                  license
                )}
              </>
            )}
          </figcaption>
        </figure>

        {offline && (
          <Chip tone="warn" dot>
            Offline: showing the copy saved on this phone
          </Chip>
        )}

        {d.description && (
          <p className="text-sm leading-relaxed text-espresso">
            {d.description}{' '}
            {d.sourceUrl && (
              <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-muted underline underline-offset-2">
                Wikipedia
              </a>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line bg-butter p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-espresso">
              <CalendarDays size={14} /> Best time
            </p>
            <p className="mt-1 font-display text-lg leading-tight text-ink">{d.bestTime ?? '—'}</p>
            {d.idealDays && <p className="text-xs text-espresso">{d.idealDays} days is ideal</p>}
          </div>
          <div className="rounded-lg border border-line bg-sky p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-espresso">
              <CloudSun size={14} /> Weather now
            </p>
            {weather && weather !== 'error' ? (
              <>
                <p className="mt-1 font-display text-lg leading-tight text-ink">
                  {weather.now.tempC}°C · {weather.now.summary}
                </p>
                <p className="text-xs text-espresso">
                  Next days {Math.min(...weather.days.map((x) => x.minC))}–{Math.max(...weather.days.map((x) => x.maxC))}°C
                </p>
                <p className="text-[0.625rem] text-muted">
                  {weather.source}
                  {weather.stale && ' · older forecast'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {weather === 'error' ? (
                  <>
                    Not available right now.{' '}
                    <button onClick={() => setWeatherTry((n) => n + 1)} className="min-h-tap underline underline-offset-4">
                      Retry
                    </button>
                  </>
                ) : (
                  'Loading…'
                )}
              </p>
            )}
          </div>
        </div>

        {d.dailyCostInr && (
          <Section icon={<Coins size={18} />} title="Cost per person per day" note="Typical spend on stay, food and local travel. Estimates, not quotes.">
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {(['shoestring', 'moderate', 'comfort', 'luxury'] as const).map((band) => (
                <li
                  key={band}
                  className={`flex justify-between rounded-md border px-3 py-2 ${you?.fromQuiz && band === style ? 'border-ink bg-butter' : 'border-line bg-paper'}`}
                >
                  <span className="text-espresso">{budgetStyleLabel[band]}</span>
                  <span className="font-medium tabular-nums text-ink">{inr(d.dailyCostInr![band])}</span>
                </li>
              ))}
            </ul>
            {you?.fromQuiz && d.idealDays && (
              <p className="mt-2 text-sm text-ink">
                Your style ({budgetStyleLabel[style].toLowerCase()}): about <span className="font-semibold">{inr(tripEstimate(d.dailyCostInr, style, d.idealDays, 1))}</span> per person for{' '}
                {d.idealDays} days, plus flights.
              </p>
            )}
            {fx && (
              <p className="mt-2 text-xs text-muted">
                ₹1,000 = {(fx.rate * 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} {fx.to} · {fx.source}
                {fx.date && `, ${fx.date.slice(0, 16)}`}
              </p>
            )}
          </Section>
        )}

        {data.attractions.length > 0 && (
          <Section icon={<Landmark size={18} />} title="Places to see" note="From OpenStreetMap. Tap one to see it on the map.">
            <ul className="divide-y divide-line rounded-md border border-line bg-paper">
              {sights.slice(0, 8).map(({ item: p, reason }) => (
                <li key={p.id}>
                  <a href={mapLink(p, d.name)} target="_blank" rel="noreferrer" className="flex min-h-tap items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{p.name}</span>
                      {(p.category || p.openingHours) && <span className="block truncate text-xs capitalize text-muted">{[p.category?.replace(/_/g, ' '), p.openingHours].filter(Boolean).join(' · ')}</span>}
                      {reason && <span className="mt-0.5 block text-[0.6875rem] font-semibold text-ok">For you · {reason}</span>}
                    </span>
                    <MapPin size={16} className="shrink-0 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.restaurants.length > 0 && (
          <Section icon={<UtensilsCrossed size={18} />} title="Places to eat" note="From OpenStreetMap.">
            <ul className="divide-y divide-line rounded-md border border-line bg-paper">
              {eateries.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <a href={mapLink(p, d.name)} target="_blank" rel="noreferrer" className="flex min-h-tap items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{p.name}</span>
                      {(p.cuisine || p.vegetarian) && (
                        <span className="block truncate text-xs capitalize text-muted">{[p.cuisine?.replace(/[_;]/g, ' '), p.vegetarian ? 'vegetarian options' : null].filter(Boolean).join(' · ')}</span>
                      )}
                    </span>
                    <MapPin size={16} className="shrink-0 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.hotels.length > 0 && (
          <Section icon={<BedDouble size={18} />} title="Places to stay" note="Hotels from OpenStreetMap. Prices are our estimate for the area, not a live rate.">
            <ul className="divide-y divide-line rounded-md border border-line bg-paper">
              {data.hotels.slice(0, 8).map((p) => (
                <li key={p.id} className="flex min-h-tap items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{[p.stars ? `${p.stars}★` : null, p.address].filter(Boolean).join(' · ') || 'Hotel'}</span>
                  </span>
                  {p.priceRange && (
                    <span className="shrink-0 text-xs tabular-nums text-espresso">
                      {inr(p.priceRange[0])}–{inr(p.priceRange[1])}/night
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <PillButton full onClick={() => navigate('/trips/new', { state: { to: d.name } })}>
          Plan a trip to {d.name}
        </PillButton>
      </div>
    </div>
  );
}
