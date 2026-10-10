import { Link, useParams } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { useTrip } from '../../hooks/useTrip';
import { markStepDone } from '../../db/repos/journey';
import { adjustedSteps, eventFromStatuses } from '../../engines/cascade';
import { PageHeader } from '../../components/layout/PageHeader';
import { JourneyTimeline } from '../../components/journey/JourneyTimeline';
import { EmergencyButtons } from '../../components/journey/EmergencyButtons';
import { Chip } from '../../components/ui/Chip';
import { useT } from '../../i18n';
import { useTranslated } from '../../hooks/useTranslated';
import NotFound from '../NotFound';

export default function ActiveTrip() {
  const { tripId } = useParams();
  const data = useTrip(tripId);
  const { t } = useT();
  const { tr } = useTranslated((data?.steps ?? []).flatMap((st) => [
    { id: `${st.id}.label`, text: st.label },
    { id: `${st.id}.hint`, text: st.hint },
  ]));
  if (data === undefined) return null;
  if (!data) return <NotFound />;
  // Progress is saved on the device, so it survives reloads and works offline.
  const { trip, flights, doneStepIds: done, pickup } = data;
  const event = eventFromStatuses(data.statuses);
  const steps = adjustedSteps(data.steps, flights, event);
  const moved = event?.kind === 'prepone' && steps !== data.steps;
  const progress = steps.length ? Math.round((done.size / steps.length) * 100) : 0;

  return (
    <div>
      <PageHeader
        back={`/trips/${trip.id}`}
        title={t('active.title')}
        sub={`${trip.title} · ${[flights[0]?.fromCode, ...flights.map((f) => f.toCode)].join(' → ')}`}
        right={
          <Chip tone="ok" dot>
            {t('active.live')}
          </Chip>
        }
      />

      <div className="px-gutter">
        {steps.length ? (
          <>
            <div className="mb-5 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-pill bg-sand">
                <div className="h-full rounded-pill bg-ok transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs font-semibold tabular-nums text-espresso">
                {done.size}/{steps.length}
              </span>
            </div>

            {moved && (
              <p className="mb-4 rounded-md border border-warn/40 bg-butter px-3 py-2 text-sm text-ink">
                {t('active.movedEarlier', { n: event.minutes })}
              </p>
            )}
            <JourneyTimeline
              steps={steps.map((st) => ({ ...st, label: tr(`${st.id}.label`, st.label), hint: tr(`${st.id}.hint`, st.hint) }))}
              done={done} onDone={(id) => void markStepDone(trip.id, id)} />
            <p className="mt-3 text-xs text-muted">{t('active.cannotDetect')}</p>
          </>
        ) : (
          <p className="rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed text-espresso">
            {t('active.noTimeline')}
          </p>
        )}

        {pickup && (
          <Link
            to={`/share/${trip.id}`}
            className="mt-5 flex min-h-tap items-center justify-between rounded-pill border border-line bg-paper px-5 text-sm font-medium text-ink"
          >
            {t('active.familyLink')} <Share2 size={18} />
          </Link>
        )}

        <h2 className="mb-3 mt-8 text-xl">{t('active.somethingWrong')}</h2>
        <EmergencyButtons tripId={trip.id} hasConnection={flights.length > 1} />
      </div>
    </div>
  );
}
