import { Clock, MapPin, Plane } from 'lucide-react';
import { useNextFlight, familyPickup, sampleUser } from '../../hooks/useTrip';
import { BoardingPassCard } from '../../components/flight/BoardingPassCard';
import { Chip } from '../../components/ui/Chip';
import { SourceChip } from '../../components/layout/SourceChip';
import { clock } from '../../utils/format';

/** Public, read-only page for family. No app chrome, no points, no private data. */
export default function FamilyPickup() {
  const { onward, lastSynced } = useNextFlight();
  if (!onward) return null;

  return (
    <div className="px-gutter pb-12 pt-6">
      <div className="flex items-center justify-between">
        <span className="font-display text-xl italic text-ink">Voyage</span>
        <SourceChip source="cloud" />
      </div>

      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted">Pickup for {familyPickup.pickerName}</p>
      <h1 className="mt-2 text-[2.25rem] leading-[1.1]">{sampleUser.name} lands at {onward.toCity} tonight</h1>

      <div className="mt-6 rounded-xl border border-line bg-butter p-6 text-center shadow-card">
        <p className="text-sm font-medium text-espresso">Leave home at</p>
        <p className="font-display text-[4.5rem] leading-none text-ink">{familyPickup.leaveHomeAt}</p>
        <p className="mt-2 flex items-center justify-center gap-1 text-sm text-espresso">
          <MapPin size={14} /> {familyPickup.meetPoint}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between px-1">
        <Chip tone="warn" dot icon={<Clock size={12} />}>
          Last synced {clock(lastSynced)}
        </Chip>
        <span className="text-xs text-muted">Updates when {sampleUser.name} taps Done</span>
      </div>

      <div className="mt-6">
        <BoardingPassCard flight={onward} />
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Plane size={14} className="mt-0.5 shrink-0" />
        Read-only link shared by {sampleUser.name}. Sample data in this prototype. The live version needs internet.
      </p>
    </div>
  );
}
