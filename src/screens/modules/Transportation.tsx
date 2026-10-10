import { Bus, Car, TrainFront, TramFront } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { TagCard } from '../../components/cards/TagCard';
import { RidePlanner } from '../../components/guide/RidePlanner';
import { useGuide } from '../../hooks/useGuide';
import type { Booking, TransportBooking, Trip } from '../../types';
import type { Pastel } from '../../design/tokens';
import { clock, day, inr } from '../../utils/format';

const modeLook: Record<TransportBooking['mode'], { Icon: typeof Car; pastel: Pastel }> = {
  cab: { Icon: Car, pastel: 'butter' },
  train: { Icon: TrainFront, pastel: 'sky' },
  metro: { Icon: TramFront, pastel: 'mint' },
  bus: { Icon: Bus, pastel: 'peach' },
};

export default function Transportation() {
  return (
    <ModuleFrame module="transportation" title="Transportation">
      {({ trip, transport, bookings }) => (
        <div className="space-y-6 pb-8">
          {transport.length > 0 && (
            <div className="space-y-3">
              {transport.map((t) => {
                const { Icon, pastel } = modeLook[t.mode];
                return (
                  <TagCard key={t.id} pastel={pastel} side={<Icon size={20} />}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-lg leading-tight text-ink">{t.title}</p>
                      <p className="shrink-0 text-sm font-semibold text-ink">{inr(t.amount)}</p>
                    </div>
                    <p className="mt-1 text-sm text-espresso">
                      {t.from} → {t.to}
                    </p>
                    <p className="mt-2 text-xs text-espresso/80">
                      {day(t.at)} · {clock(t.at)} · Ref {t.ref}
                    </p>
                  </TagCard>
                );
              })}
            </div>
          )}
          <Planner trip={trip} bookings={bookings} />
        </div>
      )}
    </ModuleFrame>
  );
}

function Planner({ trip, bookings }: { trip: Trip; bookings: Booking[] }) {
  const { guide, offline } = useGuide(trip);
  if (guide === undefined) return <p className="text-sm text-muted">Loading ways to get around {trip.to}…</p>;
  if (guide === null) return <p className="text-sm text-muted">{offline ? 'Connect to the internet to plan rides.' : `Ride planning works for the destinations in Explore. “${trip.to}” is not one yet.`}</p>;
  return <RidePlanner trip={trip} guide={guide} bookings={bookings} />;
}
