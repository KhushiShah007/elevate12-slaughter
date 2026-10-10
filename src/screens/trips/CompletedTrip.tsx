import { useParams } from 'react-router-dom';
import { ImageIcon } from 'lucide-react';
import { useTrip } from '../../hooks/useTrip';
import { PageHeader } from '../../components/layout/PageHeader';
import { StampThump } from '../../components/motion/StampThump';
import { Polaroid } from '../../components/cards/Polaroid';
import { SampleTag } from '../../components/ui/Chip';
import { day, inr, range } from '../../utils/format';
import { trueCost } from '../../engines/trueCost';
import NotFound from '../NotFound';

export default function CompletedTrip() {
  const { tripId } = useParams();
  const data = useTrip(tripId);
  if (!data) return <NotFound />;
  const { trip, memory, expenses } = data;
  const { total } = trueCost(expenses);

  return (
    <div>
      <PageHeader back="/trips?tab=completed" title={trip.title} sub={range(trip.startDate, trip.endDate)} right={<SampleTag />} />
      <div className="px-gutter">
        {memory && (
          <div className="flex items-center gap-4 rounded-lg border border-line bg-paper p-4 shadow-card">
            <StampThump label={memory.stampCode} sub={day(memory.stampDate, { day: 'numeric', month: 'short', year: '2-digit' })} tone="bad" size="lg" />
            <div>
              <p className="font-display text-2xl text-ink">{memory.stampCity}</p>
              <p className="text-sm text-muted">Stamped into your passport</p>
            </div>
          </div>
        )}

        <h2 className="mb-3 mt-8 text-xl">Memories</h2>
        <div className="no-scrollbar -mx-gutter flex gap-4 overflow-x-auto px-gutter pb-4 pt-2">
          {memory?.memories.map((m, n) => (
            <Polaroid key={m.caption} pastel={m.pastel} caption={m.caption} tilt={n % 2 ? 2 : -2} icon={<ImageIcon size={32} />} />
          ))}
        </div>

        <h2 className="mb-3 mt-6 text-xl">What it cost</h2>
        {expenses.length ? (
          <ul className="divide-y divide-line rounded-md border border-line bg-paper">
            {expenses.map((e) => (
              <li key={e.id} className="flex justify-between px-4 py-3 text-sm">
                <span className="text-espresso">{e.label}</span>
                <span className="font-medium tabular-nums text-ink">{inr(e.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between px-4 py-3 text-sm font-semibold">
              <span className="text-ink">Total</span>
              <span className="tabular-nums text-ink">{inr(total)}</span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-muted">No expenses saved for this trip.</p>
        )}
      </div>
    </div>
  );
}
