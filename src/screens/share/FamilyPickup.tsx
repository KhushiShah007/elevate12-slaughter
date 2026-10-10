import { useParams } from 'react-router-dom';
import { CheckCircle2, MapPin, Plane } from 'lucide-react';
import { useTrip, useTraveller } from '../../hooks/useTrip';
import { BoardingPassCard } from '../../components/flight/BoardingPassCard';
import { Chip } from '../../components/ui/Chip';
import { SourceChip } from '../../components/layout/SourceChip';
import NotFound from '../NotFound';

/** Public, read-only page for family. No app chrome, no points, no private data. */
export default function FamilyPickup() {
  const { token } = useParams(); // prototype: the token is the trip id
  const data = useTrip(token);
  const traveller = useTraveller();
  if (data === undefined || !traveller) return null;
  if (!data?.pickup) return <NotFound />;

  const { pickup, flights, steps, doneStepIds } = data;
  const arriving = flights[flights.length - 1];
  const lastDone = [...steps].reverse().find((s) => doneStepIds.has(s.id));

  return (
    <div className="px-gutter pb-12 pt-6">
      <div className="flex items-center justify-between">
        <span className="font-display text-xl italic text-ink">Voyage</span>
        <SourceChip source="cloud" />
      </div>

      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted">Pickup for {pickup.pickerName}</p>
      <h1 className="mt-2 text-[2.25rem] leading-[1.1]">
        {traveller.name} lands in {arriving?.toCity}
      </h1>

      <div className="mt-6 rounded-xl border border-line bg-butter p-6 text-center shadow-card">
        <p className="text-sm font-medium text-espresso">Leave home at</p>
        <p className="font-display text-[4.5rem] leading-none text-ink">{pickup.leaveHomeAt}</p>
        <p className="mt-2 flex items-center justify-center gap-1 text-sm text-espresso">
          <MapPin size={14} /> {pickup.meetPoint}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        {lastDone ? (
          <Chip tone="ok" dot icon={<CheckCircle2 size={12} />}>
            Last step: {lastDone.label}
          </Chip>
        ) : (
          <Chip dot>Not started yet</Chip>
        )}
        <span className="text-right text-xs text-muted">
          {doneStepIds.size}/{steps.length} steps done
        </span>
      </div>

      {arriving && (
        <div className="mt-6">
          <BoardingPassCard flight={arriving} />
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Plane size={14} className="mt-0.5 shrink-0" />
        Read-only link shared by {traveller.name}. Updates when they tap Done. Sample data in this prototype; the live version needs internet.
      </p>
    </div>
  );
}
