import { useMemo, useState } from 'react';
import { BedDouble, Camera, Leaf, Plane, Sparkles, TrainFront, Utensils } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import type { ItineraryItem } from '../../types';
import type { TripBundle } from '../../db/repos/trips';
import { day } from '../../utils/format';
import { buildItinerary, type PlanNote } from '../../engines/itineraryBuilder';
import { usePersona } from '../../hooks/usePersona';
import { useTranslated } from '../../hooks/useTranslated';
import { nearbyPlaces } from '../../data/sampleTrips';
import { Chip } from '../../components/ui/Chip';
import { useT, type MessageKey } from '../../i18n';
import type { Persona } from '../../engines/persona';
import { useGuide, type Guide } from '../../hooks/useGuide';
import { budgetStyle, budgetStyleLabel } from '../../engines/personalize';
import { inr } from '../../utils/format';
import { LiveItinerary } from '../../components/itinerary/LiveItinerary';
import type { Experience, Restaurant } from '../../types';

const INTEREST: Record<string, string> = { museum: 'culture', monument: 'culture', castle: 'culture', fort: 'culture', gallery: 'culture', ruins: 'culture', archaeological_site: 'culture', viewpoint: 'nature', zoo: 'nature', theme_park: 'nature' };

/** City-guide places as itinerary candidates, for trips with no hand-made plan. */
function fromGuide(guide: Guide, tripId: string) {
  const area = guide.destination.name;
  const experiences: Experience[] = guide.see.map((p) => ({ id: `g-${p.id}`, tripId, title: p.name, area, duration: '1–2 h', amount: 0, tag: p.category ?? 'sight', interests: p.category && INTEREST[p.category] ? [INTEREST[p.category]] : [] }));
  const restaurants: Restaurant[] = guide.eat.map((p) => ({ id: `g-${p.id}`, tripId, name: p.name, area, cuisine: p.cuisine ?? '', veg: !!p.vegetarian, priceLevel: p.category === 'restaurant' ? 2 : 1, note: '' }));
  return { experiences, restaurants };
}

const kindIcon: Record<ItineraryItem['kind'], typeof Plane> = {
  flight: Plane,
  stay: BedDouble,
  food: Utensils,
  see: Camera,
  move: TrainFront,
};

const noteKey: Record<PlanNote, MessageKey> = {
  match: 'match.forYou',
  veg: 'itin.note.veg',
  jain: 'food.jainNote',
  rest: 'itin.note.rest',
};

export default function Itinerary() {
  const p = usePersona();
  // Own trips get the living, server-side itinerary; the bundled sample keeps its hand-made plan.
  return <ModuleFrame module="itinerary" title="Itinerary">{(data) => (data.trip.sample ? (p ? <ItineraryView data={data} persona={p.persona} /> : null) : <LiveItinerary trip={data.trip} />)}</ModuleFrame>;
}

function ItineraryView({ data, persona }: { data: TripBundle; persona: Persona }) {
  const { t, info } = useT();
  // Own trips have no hand-made places: plan from the city guide instead.
  const needsGuide = data.experiences.length === 0;
  const { guide } = useGuide(needsGuide ? data.trip : null);
  const style = budgetStyle(persona);
  const days = useMemo(() => {
    const extra = needsGuide && guide ? fromGuide(guide, data.trip.id) : null;
    return buildItinerary({
      trip: data.trip,
      days: data.days,
      items: data.items,
      stays: data.accommodations,
      experiences: extra?.experiences ?? data.experiences,
      restaurants: extra?.restaurants ?? data.restaurants,
      persona,
      nearby: nearbyPlaces,
      defaultRegion: guide?.destination.name ?? data.trip.to,
    });
  }, [data, persona, guide, needsGuide]);
  const [date, setDate] = useState<string | null>(null);
  const current = days.find((d) => d.date === date) ?? days.find((d) => !d.travelDay) ?? days[0];
  const { tr } = useTranslated(current ? [{ id: 'title', text: current.title }, ...current.items.map((i) => ({ id: i.id, text: i.title }))] : []);
  if (!current) return null;

  return (
    <>
      <p className="mb-3 flex items-start gap-2 text-xs leading-relaxed text-espresso">
        <span className="text-base leading-none">{persona.emoji}</span>
        {t('itin.basedOn', { persona: t(`persona.${persona.id}.title` as MessageKey) })}
      </p>
      {guide?.destination.dailyCostInr && (
        <p className="mb-3 rounded-md border border-line bg-butter px-3 py-2 text-xs text-ink">
          Typical spend for a {budgetStyleLabel[style].toLowerCase()} day in {guide.destination.name}: about {inr(guide.destination.dailyCostInr[style])} per person (stay, food, local travel), so about{' '}
          {inr(guide.destination.dailyCostInr[style] * data.trip.travellers * days.length)} for the whole trip. Estimate.
        </p>
      )}

      {/* Calendar strip: every day of the trip */}
      <div className="no-scrollbar -mx-gutter flex gap-2 overflow-x-auto px-gutter pb-2">
        {days.map((d) => {
          const on = d.date === current.date;
          const suggested = d.items.some((i) => i.suggested);
          return (
            <button
              key={d.date}
              onClick={() => setDate(d.date)}
              aria-pressed={on}
              // Keep the chosen day visible in the strip.
              ref={on ? (el) => el?.scrollIntoView({ inline: 'center', block: 'nearest' }) : undefined}
              className={`relative flex min-h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center rounded-md border ${
                on ? 'border-ink bg-ink text-ivory' : 'border-line bg-paper text-ink'
              }`}
            >
              <span className="text-[0.625rem] font-semibold uppercase tracking-widest opacity-80">{day(d.date, { weekday: 'short' }, info.intl)}</span>
              <span className="font-display text-2xl">{day(d.date, { day: 'numeric' }, 'en-GB')}</span>
              {suggested && <span className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${on ? 'bg-butter' : 'bg-ok'}`} />}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{day(current.date, { weekday: 'long', day: 'numeric', month: 'long' }, info.intl)}</p>
        <h2 className="mt-1 text-2xl">{tr('title', current.title)}</h2>
        {current.region && <p className="text-sm text-muted">{current.region}</p>}
        {current.items.length === 0 && <p className="mt-4 text-sm text-espresso">{t('itin.empty')}</p>}
        <ol className="mt-4 space-y-2">
          {current.items.map((it) => {
            const Icon = kindIcon[it.kind];
            return (
              <li
                key={it.id}
                className={`flex min-h-tap items-center gap-3 rounded-md px-2 py-1.5 ${it.suggested ? 'border border-dashed border-ok/50 bg-mint/40' : ''}`}
              >
                <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-espresso">{it.time}</span>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${it.suggested ? 'bg-mint' : 'bg-lavender'}`}>
                  <Icon size={16} className="text-ink" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{tr(it.id, it.title)}</span>
                  {it.suggested && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      <Chip icon={<Sparkles size={10} />}>{t('itin.suggested')}</Chip>
                      {it.note && it.note !== 'rest' && (
                        <Chip tone="ok" icon={it.note === 'match' ? undefined : <Leaf size={10} />}>
                          {t(noteKey[it.note])}
                        </Chip>
                      )}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
