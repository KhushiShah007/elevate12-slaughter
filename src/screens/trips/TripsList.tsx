import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Plus, Users } from 'lucide-react';
import { useMemories, useTrips } from '../../hooks/useTrip';
import { PageHeader } from '../../components/layout/PageHeader';
import { Segmented } from '../../components/ui/Segmented';
import { TicketCard } from '../../components/cards/TicketCard';
import { StampCard } from '../../components/cards/StampCard';
import { SampleTag } from '../../components/ui/Chip';
import { range, day } from '../../utils/format';
import type { Pastel } from '../../design/tokens';

const stampPastels: Pastel[] = ['peach', 'lavender', 'mint', 'sky', 'rose', 'butter'];

export default function TripsList() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'completed' ? 'completed' : 'existing';
  const trips = useTrips();
  const memories = useMemories();
  if (!trips || !memories) return null;
  const { existing, completed } = trips;

  return (
    <div>
      <PageHeader title="Trips" sub="Every trip keeps its own data, never shared between trips." right={<SampleTag />} />
      <div className="px-gutter">
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === 'completed' ? { tab: 'completed' } : {})}
          options={[
            { value: 'existing', label: `Existing (${existing.length})` },
            { value: 'completed', label: `Completed (${completed.length})` },
          ]}
        />

        {tab === 'existing' ? (
          <div className="mt-5 space-y-4">
            {existing.map((t, n) => (
              <Link key={t.id} to={`/trips/${t.id}`} className="block">
                <TicketCard
                  pastel={n === 0 ? 'peach' : 'sky'}
                  stub={
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-espresso">
                        <Users size={16} /> {t.travellers} travellers
                      </span>
                      <span className="flex items-center gap-1 font-medium text-ink">
                        Open <ArrowRight size={16} />
                      </span>
                    </div>
                  }
                >
                  <p className="text-xs font-semibold uppercase tracking-widest text-espresso">{range(t.startDate, t.endDate)}</p>
                  <p className="mt-1 font-display text-2xl text-ink">{t.title}</p>
                  <p className="text-sm text-espresso">
                    {t.from} → {t.to}
                  </p>
                </TicketCard>
              </Link>
            ))}
            <Link
              to="/trips/new"
              className="flex min-h-[4.5rem] items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line text-sm font-medium text-espresso"
            >
              <Plus size={18} /> Plan a new trip
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm text-muted">Your stamp collection. Tap a stamp for memories and spend.</p>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6">
              {completed.map((t, n) => {
                const m = memories.find((c) => c.tripId === t.id);
                return (
                  <Link key={t.id} to={`/trips/${t.id}/memories`}>
                    <StampCard pastel={stampPastels[n % stampPastels.length]} tilt={n % 2 ? 2.5 : -2}>
                      <p className="font-display text-3xl text-ink">{m?.stampCode}</p>
                      <p className="mt-1 text-sm font-medium text-ink">{m?.stampCity}</p>
                      <p className="mt-2 text-[0.6875rem] uppercase tracking-widest text-espresso">{day(t.startDate, { month: 'short', year: 'numeric' })}</p>
                    </StampCard>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
