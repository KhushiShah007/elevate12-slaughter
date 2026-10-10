import { Leaf, MapPin } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { TagCard } from '../../components/cards/TagCard';
import { Chip } from '../../components/ui/Chip';
import { PlaceList } from '../../components/guide/PlaceList';
import { usePersona } from '../../hooks/usePersona';
import { useGuide } from '../../hooks/useGuide';
import { allowanceFor } from '../../hooks/useAllowance';
import { defaultPersona, orderRestaurants } from '../../engines/persona';
import { budgetStyleLabel } from '../../engines/personalize';
import { useT } from '../../i18n';
import type { Restaurant, Trip } from '../../types';

export default function Restaurants() {
  const p = usePersona();
  const { t } = useT();
  const vegFirst = p?.persona.vegFirst ?? false;

  return (
    <ModuleFrame module="restaurants" title="Restaurants & Cafes" sub={vegFirst ? t('effect.veg') : undefined}>
      {({ trip, restaurants }) => (
        <div className="space-y-6 pb-8">
          {restaurants.length > 0 && (
            <div className="space-y-3">
              {(p ? orderRestaurants(restaurants, p.persona) : restaurants).map((r, i) => (
                <SavedRestaurant key={r.id} r={r} i={i} vegFirst={vegFirst} jain={!!p?.persona.jain} />
              ))}
            </div>
          )}
          <CityEateries trip={trip} />
        </div>
      )}
    </ModuleFrame>
  );
}

function SavedRestaurant({ r, i, vegFirst, jain }: { r: Restaurant; i: number; vegFirst: boolean; jain: boolean }) {
  const { t } = useT();
  return (
    <TagCard pastel={i % 2 ? 'butter' : 'peach'} side={<span className="font-display text-sm text-ink">{'₹'.repeat(r.priceLevel)}</span>}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-lg leading-tight text-ink">{r.name}</p>
        {r.veg ? (
          <Chip tone="ok" icon={<Leaf size={11} />}>
            Veg
          </Chip>
        ) : (
          vegFirst && (
            <Chip tone="warn" dot>
              {t('food.notVeg')}
            </Chip>
          )
        )}
      </div>
      <p className="mt-1 text-sm text-espresso">{r.cuisine}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-espresso/80">
        <MapPin size={12} /> {r.area}
      </p>
      <p className="mt-2 text-xs italic text-espresso">{r.note}</p>
      {jain && r.veg && <p className="mt-1 text-xs font-medium text-ink">🌱 {t('food.jainNote')}</p>}
    </TagCard>
  );
}

/** Real places to eat in the trip's city, priced for the traveller's budget. */
function CityEateries({ trip }: { trip: Trip }) {
  const p = usePersona();
  const { guide, style, offline } = useGuide(trip);
  if (guide === undefined) return <p className="text-sm text-muted">Finding places to eat in {trip.to}…</p>;
  if (guide === null) return <p className="text-sm text-muted">{offline ? 'Connect to the internet once to load places to eat.' : `We don't have a food guide for “${trip.to}” yet.`}</p>;
  return (
    <section className="space-y-3">
      <h2 className="text-xl">Places to eat in {guide.destination.name}</h2>
      <p className="-mt-2 text-xs text-muted">Prices for a {budgetStyleLabel[style].toLowerCase()} budget, per person per meal.</p>
      <PlaceList guide={guide} kind="eat" persona={p?.persona ?? defaultPersona()} pastels={['butter', 'peach']} allowance={allowanceFor(trip, guide, style)} />
    </section>
  );
}
