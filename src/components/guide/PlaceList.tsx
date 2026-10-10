import { useMemo, useState } from 'react';
import { ExternalLink, Leaf, MapPin, Sparkles, Star } from 'lucide-react';
import { Chip } from '../ui/Chip';
import { Segmented } from '../ui/Segmented';
import { TagCard } from '../cards/TagCard';
import { inr } from '../../utils/format';
import { placeReason } from '../../engines/personalize';
import type { Persona } from '../../engines/persona';
import type { Guide, GuidePlace } from '../../hooks/useGuide';
import type { Pastel } from '../../design/tokens';
import type { Allowance } from '../../hooks/useAllowance';
import { addToItinerary } from '../../api/itinerary';

type Order = 'you' | 'cheap' | 'rated';

const sightLabel = (c: string | null) => (c ? c.replace(/_/g, ' ') : 'Place');

/** Cheapest first: free or cheap first, unknown in the middle, paid or dearer last. */
const priceRank = (p: GuidePlace) => (p.kind === 'eat' ? (p.costRange?.[0] ?? 1e6) : p.entry === 'free' ? 0 : p.entry === null ? 1 : 2);

/** Places to see or eat from the city guide, ordered for the traveller, with costs and links. */
export function PlaceList({ guide, kind, persona, pastels, allowance, tripId }: { guide: Guide; kind: 'see' | 'eat'; persona: Persona; pastels: Pastel[]; allowance?: Allowance | null; tripId?: string | null }) {
  const [added, setAdded] = useState<Record<number, string>>({});
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
  const [order, setOrder] = useState<Order>(persona.id === 'saver' ? 'cheap' : 'you');
  const [vegOnly, setVegOnly] = useState(false);
  const [fitsOnly, setFitsOnly] = useState(false);
  /** Fits the daily allowance: a meal within the per-meal amount, or free entry. */
  const fits = (p: GuidePlace) => (allowance ? (kind === 'eat' ? p.costRange != null && p.costRange[0] <= allowance.meal : p.entry === 'free') : false);
  const places = kind === 'see' ? guide.see : guide.eat;
  const rated = places.some((p) => p.rating != null);

  const list = useMemo(() => {
    const rows = places
      .filter((p) => !vegOnly || p.vegetarian)
      .filter((p) => !fitsOnly || fits(p))
      .map((p, index) => ({
        p,
        index,
        reason: kind === 'see' ? placeReason(p.category, persona) : persona.vegFirst && p.vegetarian ? (persona.jain ? 'Vegetarian (ask about Jain food)' : 'Vegetarian options') : null,
      }));
    const byYou = (a: (typeof rows)[number], b: (typeof rows)[number]) => Number(Boolean(b.reason)) - Number(Boolean(a.reason)) || a.index - b.index;
    if (order === 'cheap') rows.sort((a, b) => priceRank(a.p) - priceRank(b.p) || byYou(a, b));
    else if (order === 'rated') rows.sort((a, b) => (b.p.rating ?? 0) - (a.p.rating ?? 0) || byYou(a, b));
    else rows.sort(byYou);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, order, vegOnly, fitsOnly, persona, kind, allowance]);

  return (
    <div className="space-y-3">
      <Segmented
        value={order}
        onChange={setOrder}
        options={[
          { value: 'you', label: 'For you' },
          { value: 'cheap', label: kind === 'eat' ? 'Cheapest' : 'Free first' },
          ...(rated ? [{ value: 'rated' as const, label: 'Top rated' }] : []),
        ]}
      />
      {allowance && (
        <label className="flex min-h-tap items-center gap-2 text-sm text-espresso">
          <input type="checkbox" checked={fitsOnly} onChange={(e) => setFitsOnly(e.target.checked)} className="h-5 w-5 accent-ink" />
          {kind === 'eat' ? `Fits my budget (about ${inr(allowance.meal)} a meal)` : 'Free entry only'}
        </label>
      )}
      {kind === 'eat' && (
        <label className="flex min-h-tap items-center gap-2 text-sm text-espresso">
          <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} className="h-5 w-5 accent-ink" />
          Only places marked vegetarian-friendly
        </label>
      )}
      {list.map(({ p, reason }, i) => (
        <TagCard
          key={p.id}
          pastel={pastels[i % pastels.length]}
          side={
            <span className="text-center font-display text-sm leading-tight text-ink">
              {kind === 'eat' && p.costRange ? (
                <>
                  {inr(p.costRange[0])}
                  <span className="block text-[0.625rem] font-body text-espresso">to {inr(p.costRange[1])}</span>
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
              {p.vegetarian && (
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
            {kind === 'see' && p.entry === null && <span className="normal-case text-muted"> · entry fee not listed</span>}
          </p>
          {p.openingHours && <p className="mt-1 text-xs text-espresso/80">{p.openingHours}</p>}
          {p.rating != null && (
            <p className="mt-1 flex items-center gap-1 text-xs text-ink">
              <Star size={12} className="fill-current" /> {p.rating.toFixed(1)}
              {p.ratingCount != null && <span className="text-muted">({p.ratingCount.toLocaleString('en-IN')} Google reviews)</span>}
            </p>
          )}
          {reason && (
            <p className="mt-1 flex items-center gap-1 text-[0.6875rem] font-semibold text-ok">
              <Sparkles size={11} /> For you · {reason}
            </p>
          )}
          <p className="mt-2 flex flex-wrap gap-x-4 text-xs">
            <a href={p.reviewsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[2rem] items-center gap-1 font-medium text-ink underline underline-offset-4">
              Reviews <ExternalLink size={12} />
            </a>
            <a href={p.mapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[2rem] items-center gap-1 text-espresso underline underline-offset-4">
              Map <MapPin size={12} />
            </a>
            {tripId && (
              <button onClick={() => void add(p)} disabled={!!added[p.id]} className="inline-flex min-h-[2rem] items-center gap-1 font-medium text-ink underline underline-offset-4 disabled:no-underline disabled:opacity-70">
                {added[p.id] ?? '+ Add to plan'}
              </button>
            )}
          </p>
        </TagCard>
      ))}
      {!list.length && <p className="text-sm text-muted">Nothing matches. Turn off the vegetarian filter to see all places.</p>}
      <p className="pt-1 text-xs text-muted">{guide.note}</p>
    </div>
  );
}
