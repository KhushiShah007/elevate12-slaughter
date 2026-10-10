import { Link, useParams } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { useTrip } from '../../hooks/useTrip';
import { markStepDone } from '../../db/repos/journey';
import { adjustedSteps, eventFromStatuses } from '../../engines/cascade';
import { PageHeader } from '../../components/layout/PageHeader';
import { JourneyTimeline } from '../../components/journey/JourneyTimeline';
import { EmergencyButtons } from '../../components/journey/EmergencyButtons';
import { Chip } from '../../components/ui/Chip';
import NotFound from '../NotFound';

export default function ActiveTrip() {
  const { tripId } = useParams();
  const data = useTrip(tripId);
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
        title="On the way"
        sub={`${trip.title} · ${[flights[0]?.fromCode, ...flights.map((f) => f.toCode)].join(' → ')}`}
        right={
          <Chip tone="ok" dot>
            Trip live
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
                Your flight moved earlier, so every step below is {event.minutes} min earlier too.
              </p>
            )}
            <JourneyTimeline steps={steps} done={done} onDone={(id) => void markStepDone(trip.id, id)} />
            <p className="mt-3 text-xs text-muted">We cannot detect where you are. Tap Done after each step so your family stays updated.</p>
          </>
        ) : (
          <p className="rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed text-espresso">
            No airport timeline for this trip yet. It appears here once the flight times and your leave-home plan are set.
          </p>
        )}

        {pickup && (
          <Link
            to={`/share/${trip.id}`}
            className="mt-5 flex min-h-tap items-center justify-between rounded-pill border border-line bg-paper px-5 text-sm font-medium text-ink"
          >
            Family pickup link <Share2 size={18} />
          </Link>
        )}

        <h2 className="mb-3 mt-8 text-xl">Something wrong?</h2>
        <EmergencyButtons tripId={trip.id} hasConnection={flights.length > 1} />
      </div>
    </div>
  );
}
