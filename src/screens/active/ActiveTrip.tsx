import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { useTrip, journeySteps } from '../../hooks/useTrip';
import { PageHeader } from '../../components/layout/PageHeader';
import { JourneyTimeline } from '../../components/journey/JourneyTimeline';
import { EmergencyButtons } from '../../components/journey/EmergencyButtons';
import { Chip } from '../../components/ui/Chip';
import NotFound from '../NotFound';

export default function ActiveTrip() {
  const { tripId } = useParams();
  const data = useTrip(tripId);
  // Prototype: progress lives in memory. Goal 2 saves it on the device.
  const [done, setDone] = useState<Set<string>>(new Set());
  if (!data) return <NotFound />;
  const { trip, flights } = data;
  const progress = Math.round((done.size / journeySteps.length) * 100);

  return (
    <div>
      <PageHeader
        back={`/trips/${trip.id}`}
        title="On the way"
        sub={`${trip.title} · ${[flights[0]?.fromCode, ...flights.map((f) => f.toCode)].join(" → ")}`}
        right={
          <Chip tone="ok" dot>
            Trip live
          </Chip>
        }
      />

      <div className="px-gutter">
        <div className="mb-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-pill bg-sand">
            <div className="h-full rounded-pill bg-ok transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-semibold tabular-nums text-espresso">
            {done.size}/{journeySteps.length}
          </span>
        </div>

        <JourneyTimeline steps={journeySteps} done={done} onDone={(id) => setDone((d) => new Set(d).add(id))} />
        <p className="mt-3 text-xs text-muted">We cannot detect where you are. Tap Done after each step so your family stays updated.</p>

        <Link
          to="/share/demo-riya"
          className="mt-5 flex min-h-tap items-center justify-between rounded-pill border border-line bg-paper px-5 text-sm font-medium text-ink"
        >
          Family pickup link <Share2 size={18} />
        </Link>

        <h2 className="mb-3 mt-8 text-xl">Something wrong?</h2>
        <EmergencyButtons tripId={trip.id} />
      </div>
    </div>
  );
}
