import { Clock, MapPin, Sparkles } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { StampCard } from '../../components/cards/StampCard';
import { Chip } from '../../components/ui/Chip';
import { PlaceList } from '../../components/guide/PlaceList';
import type { Pastel } from '../../design/tokens';
import { inr } from '../../utils/format';
import { usePersona } from '../../hooks/usePersona';
import { useGuide } from '../../hooks/useGuide';
import { allowanceFor } from '../../hooks/useAllowance';
import { defaultPersona, orderExperiences } from '../../engines/persona';
import { useT, type MessageKey } from '../../i18n';
import type { Trip } from '../../types';

const pastels: Pastel[] = ['rose', 'lavender', 'mint', 'butter'];

export default function Experiences() {
  const p = usePersona();
  const { t } = useT();
  const sub = p?.fromQuiz ? `${p.persona.emoji} ${t(`persona.${p.persona.id}.title` as MessageKey)}` : undefined;

  return (
    <ModuleFrame module="experiences" title="Experiences" sub={sub}>
      {({ trip, experiences }) => (
        <div className="space-y-6 pb-8">
          {experiences.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 pt-1">
              {(p ? orderExperiences(experiences, p.persona) : experiences.map((item) => ({ item, match: false }))).map(({ item: e, match }, i) => (
                <StampCard key={e.id} pastel={pastels[i % pastels.length]} tilt={i % 2 ? 1.5 : -1.5} className="h-full">
                  {match && (
                    <Chip tone="ok" icon={<Sparkles size={11} />} className="mb-2">
                      {t('match.forYou')}
                    </Chip>
                  )}
                  <p className="font-display text-lg leading-tight text-ink">{e.title}</p>
                  <p className="mt-2 flex items-center gap-1 text-xs text-espresso">
                    <MapPin size={12} /> {e.area}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-espresso">
                    <Clock size={12} /> {e.duration}
                  </p>
                  <p className="mt-2 font-semibold text-ink">{e.amount ? inr(e.amount) : t('options.free')}</p>
                  <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-widest text-espresso/80">{e.tag}</p>
                </StampCard>
              ))}
            </div>
          )}
          <CitySights trip={trip} />
        </div>
      )}
    </ModuleFrame>
  );
}

/** Real places to see in the trip's city, ordered for the traveller. */
function CitySights({ trip }: { trip: Trip }) {
  const p = usePersona();
  const { guide, style, offline } = useGuide(trip);
  if (guide === undefined) return <p className="text-sm text-muted">Finding things to do in {trip.to}…</p>;
  if (guide === null) return <p className="text-sm text-muted">{offline ? 'Connect to the internet once to load things to do.' : `We don't have a guide for “${trip.to}” yet.`}</p>;
  return (
    <section className="space-y-3">
      <h2 className="text-xl">Things to do in {guide.destination.name}</h2>
      <PlaceList guide={guide} kind="see" persona={p?.persona ?? defaultPersona()} pastels={['lavender', 'mint', 'rose', 'butter']} allowance={allowanceFor(trip, guide, style)} tripId={trip.sample ? null : trip.id} />
    </section>
  );
}
