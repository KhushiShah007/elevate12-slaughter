import { useMemo, useState } from 'react';
import { Clock, ExternalLink, Gem, Leaf, MapPin, Navigation, Phone, Sparkles, Star } from 'lucide-react';
import { Chip } from '../ui/Chip';
import { Segmented } from '../ui/Segmented';
import { TagCard } from '../cards/TagCard';
import { inr } from '../../utils/format';
import { placeReason } from '../../engines/personalize';
import { isOpen, km } from '../../engines/planner';
import type { Persona } from '../../engines/persona';
import type { Guide, GuidePlace } from '../../hooks/useGuide';
import type { Pastel } from '../../design/tokens';
import type { Allowance } from '../../hooks/useAllowance';
import { addToItinerary } from '../../api/itinerary';

type Order = 'you' | 'cheap' | 'rated' | 'gems' | 'near';
type SeeFilter = 'all' | 'famous' | 'gems' | 'indoor' | 'outdoor';
const DIETS = ['veg', 'vegan', 'jain', 'halal'] as const;
const DIET_LABEL: Record<string, string> = { veg: 'Vegetarian', vegan: 'Vegan', jain: 'Jain', halal: 'Halal' };

const sightLabel = (c: string | null) => (c ? c.replace(/_/g, ' ') : 'Place');
const isGem = (p: GuidePlace) => !p.famous && p.nicheScore >= 0.5;
/** Cheapest first: free or cheap first, unknown in the middle, paid or dearer last. */
const priceRank = (p: GuidePlace) => (p.kind === 'eat' ? (p.costRange?.[0] ?? 1e6) : p.entry === 'free' ? 0 : p.entry === null ? 1 : 2);
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Places to see or eat from the city guide, ordered for the traveller, with costs and links. */
export function PlaceList({ guide, kind, persona, pastels, allowance, tripId, origin }: {
  guide: Guide;
  kind: 'see' | 'eat';
  persona: Persona;
  pastels: Pastel[];
  allowance?: Allowance | null;
  tripId?: string | null;
  /** Where distances are measured from (the saved stay, else the city centre). */
  origin?: { lat: number; lon: number; label: string } | null;
}) {
  const [order, setOrder] = useState<Order>(persona.id === 'saver' ? 'cheap' : 'you');
  const [seeFilter, setSeeFilter] = useState<SeeFilter>('all');
  const [diets, setDiets] = useState<string[]>([]);
  const [cuisine, setCuisine] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [fitsOnly, setFitsOnly] = useState(false);
  const [added, setAdded] = useState<Record<number, string>>({});
  const places = kind === 'see' ? guide.see : guide.eat;
  const rated = places.some((p) => p.rating != null);
  const from = origin ?? { lat: guide.destination.lat, lon: guide.destination.lon, label: `${guide.destination.name} centre` };
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const cuisines = useMemo(() => [...new Set(guide.eat.flatMap((p) => (p.cuisine ?? '').split(',').map((c) => c.trim().toLowerCase())).filter(Boolean))].sort(), [guide.eat]);

  /** Fits the daily allowance: a meal within the per-meal amount, or free entry. */
  const fits = (p: GuidePlace) => (allowance ? (kind === 'eat' ? p.costRange != null && p.costRange[0] <= allowance.meal : p.entry === 'free') : false);
  const add = async (p: GuidePlace) => {
    if (!tripId) return;
    setAdded((a) => ({ ...a, [p.id]: 'Adding…' }));
    try {
      const r = await addToItinerary(tripId, `${kind}-${p.id}`);
      setAdded((a) => ({ ...a, [p.id]: r.changed ? 'Added to plan' : 'Already planned' }));
    } catch {
      setAdded((a) => ({ ...a, [p.id]: 'Could not add' }));
    }
  };

  const list = useMemo(() => {
    const rows = places
      .filter((p) => (kind === 'see' ? (seeFilter === 'all' ? true : seeFilter === 'famous' ? p.famous : seeFilter === 'gems' ? isGem(p) : seeFilter === 'indoor' ? p.indoor : !p.indoor) : true))
      .filter((p) => kind !== 'eat' || diets.every((d) => p.diets.includes(d) || (d === 'veg' && p.vegetarian)))
      .filter((p) => kind !== 'eat' || !cuisine || (p.cuisine ?? '').toLowerCase().includes(cuisine))
      .filter((p) => kind !== 'eat' || maxPrice == null || (p.costRange != null && p.costRange[0] <= maxPrice))
      .filter((p) => !fitsOnly || fits(p))
      .map((p, index) => ({
        p,
        index,
        dist: p.lat != null && p.lon != null ? km(from, p) : null,
        reason: kind === 'see' ? placeReason(p.category, persona) : persona.vegFirst && (p.vegetarian || p.diets.includes('veg')) ? (persona.jain ? 'Vegetarian (ask about Jain food)' : 'Vegetarian options') : null,
      }));
    const byYou = (a: (typeof rows)[number], b: (typeof rows)[number]) => Number(Boolean(b.reason)) - Number(Boolean(a.reason)) || a.index - b.index;
    if (order === 'cheap') rows.sort((a, b) => priceRank(a.p) - priceRank(b.p) || byYou(a, b));
    else if (order === 'rated') rows.sort((a, b) => (b.p.rating ?? 0) - (a.p.rating ?? 0) || byYou(a, b));
    else if (order === 'gems') rows.sort((a, b) => b.p.nicheScore - a.p.nicheScore || byYou(a, b));
    else if (order === 'near') rows.sort((a, b) => (a.dist ?? 99) - (b.dist ?? 99));
    else rows.sort(byYou);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, order, seeFilter, diets, cuisine, maxPrice, fitsOnly, persona, kind, allowance, from.lat, from.lon]);

  const chip = (on: boolean) => `min-h-[2.25rem] rounded-pill border px-3 text-xs ${on ? 'border-ink bg-ink text-ivory' : 'border-line bg-paper text-ink'}`;

  return (
    <div className="space-y-3">
      <Segmented
        value={order}
        onChange={setOrder}
        options={[
          { value: 'you', label: 'For you' },
          { value: 'cheap', label: kind === 'eat' ? 'Cheapest' : 'Free first' },
          ...(kind === 'see' ? [{ value: 'gems' as const, label: 'Hidden gems' }] : [{ value: 'near' as const, label: 'Nearest' }]),
          ...(rated ? [{ value: 'rated' as const, label: 'Top rated' }] : []),
        ]}
      />
      {kind === 'see' ? (
        <div className="flex flex-wrap gap-2">
          {(['all', 'famous', 'gems', 'indoor', 'outdoor'] as const).map((f) => (
            <button key={f} onClick={() => setSeeFilter(f)} aria-pressed={seeFilter === f} className={chip(seeFilter === f)}>
              {{ all: 'All', famous: 'Famous', gems: 'Hidden gems', indoor: 'Indoors', outdoor: 'Outdoors' }[f]}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {DIETS.map((d) => (
              <button key={d} onClick={() => setDiets((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))} aria-pressed={diets.includes(d)} className={chip(diets.includes(d))}>
                {DIET_LABEL[d]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="Cuisine" className="min-h-tap rounded-md border border-line bg-paper px-3 text-sm capitalize">
              <option value="">Any cuisine</option>
              {cuisines.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={maxPrice ?? ''} onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : null)} aria-label="Price per person" className="min-h-tap rounded-md border border-line bg-paper px-3 text-sm">
              <option value="">Any price</option>
              {[300, 600, 1000, 2000].map((v) => (
                <option key={v} value={v}>
                  Up to {inr(v)} pp
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {allowance && (
        <label className="flex min-h-tap items-center gap-2 text-sm text-espresso">
          <input type="checkbox" checked={fitsOnly} onChange={(e) => setFitsOnly(e.target.checked)} className="h-5 w-5 accent-ink" />
          {kind === 'eat' ? `Fits my budget (about ${inr(allowance.meal)} a meal)` : 'Free entry only'}
        </label>
      )}

      {list.map(({ p, reason, dist }, i) => {
        const open = p.openingHours ? isOpen(p.openingHours, today, hhmm(now), hhmm(new Date(now.getTime() + 30 * 60_000))) : null;
        const why = reason ?? (p.famous ? 'One of the best-known sights here' : isGem(p) ? 'Loved locally, fewer crowds' : null);
        return (
          <TagCard
            key={p.id}
            pastel={pastels[i % pastels.length]}
            side={
              <span className="text-center font-display text-sm leading-tight text-ink">
                {kind === 'eat' && p.costRange ? (
                  <>
                    {inr(p.costRange[0])}
                    <span className="block font-body text-[0.625rem] text-espresso">to {inr(p.costRange[1])}</span>
                  </>
                ) : p.entry === 'free' ? (
                  'Free'
                ) : p.entry === 'paid' ? (
                  'Ticket'
                ) : (
                  '—'
                )}
              </span>
            }
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-lg leading-tight text-ink">{p.name}</p>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {kind === 'see' && p.famous && <Chip>Famous</Chip>}
                {kind === 'see' && isGem(p) && <Chip icon={<Gem size={10} />}>Hidden gem</Chip>}
                {(p.vegetarian || p.diets.includes('veg')) && (
                  <Chip tone="ok" icon={<Leaf size={11} />}>
                    Veg
                  </Chip>
                )}
                {fits(p) && <Chip tone="ok">Fits your budget</Chip>}
              </span>
            </div>
            <p className="mt-1 text-sm capitalize text-espresso">
              {kind === 'eat' ? (p.cuisine ?? 'Restaurant') : sightLabel(p.category)}
              {kind === 'eat' && p.costRange && <span className="normal-case text-muted"> · per person, estimate</span>}
              {kind === 'see' && <span className="normal-case text-muted"> · {p.indoor ? 'indoors' : 'outdoors'} · about {p.durationMin} min · effort {p.intensity}/5</span>}
            </p>
            {p.diets.filter((d) => d !== 'veg').length > 0 && <p className="mt-1 text-xs text-ink">{p.diets.filter((d) => d !== 'veg').map((d) => DIET_LABEL[d]).join(' · ')}</p>}
            {p.description && <p className="mt-1 text-xs text-espresso">{p.description}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-espresso/80">
              {p.openingHours && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {open === true ? <span className="font-medium text-ok">Open now</span> : open === false ? <span className="text-bad">Closed now</span> : null} {p.openingHours}
                </span>
              )}
              {dist != null && <span>· {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`} from {from.label}</span>}
              {kind === 'see' && p.bestTime && <span>· best: {p.bestTime}</span>}
            </p>
            {p.rating != null && (
              <p className="mt-1 flex items-center gap-1 text-xs text-ink">
                <Star size={12} className="fill-current" /> {p.rating.toFixed(1)}
                {p.ratingCount != null && <span className="text-muted">({p.ratingCount.toLocaleString('en-IN')} Google reviews)</span>}
              </p>
            )}
            {why && (
              <p className="mt-1 flex items-center gap-1 text-[0.6875rem] font-semibold text-ok">
                <Sparkles size={11} /> {reason ? 'For you · ' : ''}
                {why}
              </p>
            )}
            <p className="mt-2 flex flex-wrap gap-x-4 text-xs">
              <a href={p.reviewsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[2rem] items-center gap-1 font-medium text-ink underline underline-offset-4">
                Reviews <ExternalLink size={12} />
              </a>
              {p.directionsUrl ? (
                <a href={p.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[2rem] items-center gap-1 text-espresso underline underline-offset-4">
                  Directions <Navigation size={12} />
                </a>
              ) : (
                <a href={p.mapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[2rem] items-center gap-1 text-espresso underline underline-offset-4">
                  Map <MapPin size={12} />
                </a>
              )}
              {p.phone && (
                <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="inline-flex min-h-[2rem] items-center gap-1 text-espresso underline underline-offset-4">
                  Call <Phone size={12} />
                </a>
              )}
              {kind === 'eat' && (p.reservationUrl ?? p.website) && (
                <a href={(p.reservationUrl ?? p.website)!} target="_blank" rel="noreferrer" className="inline-flex min-h-[2rem] items-center gap-1 text-espresso underline underline-offset-4">
                  {p.reservationUrl ? 'Reserve' : 'Website'} <ExternalLink size={12} />
                </a>
              )}
              {tripId && (
                <button onClick={() => void add(p)} disabled={!!added[p.id]} className="inline-flex min-h-[2rem] items-center gap-1 font-medium text-ink underline underline-offset-4 disabled:no-underline disabled:opacity-70">
                  {added[p.id] ?? (kind === 'eat' ? '+ Add as a meal' : '+ Add to plan')}
                </button>
              )}
            </p>
            {kind === 'see' && p.bookingOptions.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-x-3 text-[0.6875rem] text-muted">
                Book or find tours:
                {p.bookingOptions.map((b) => (
                  <a key={b.provider} href={b.url} target="_blank" rel="noreferrer sponsored" className="underline underline-offset-2">
                    {b.provider}
                  </a>
                ))}
              </p>
            )}
          </TagCard>
        );
      })}
      {!list.length && <p className="text-sm text-muted">Nothing matches these filters. Clear a filter to see more places.</p>}
      <p className="pt-1 text-xs text-muted">{guide.note}</p>
      {kind === 'see' && <p className="text-[0.6875rem] text-muted">Tour links are searches on partner sites; Voyage may earn a commission in future. Prices and availability are set by them.</p>}
    </div>
  );
}
