import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BedDouble, CalendarRange, Car, FileText, Plane, Sparkles, UtensilsCrossed, Wallet2 } from 'lucide-react';
import { useState } from 'react';
import { useTrip } from '../../hooks/useTrip';
import { deleteTrip } from '../../db/repos/trips';
import { modulePastel } from '../../design/tokens';
import { fadeUp, stagger } from '../../design/motion';
import { PageHeader } from '../../components/layout/PageHeader';
import { Tile } from '../../components/ui/Tile';
import { PillButton } from '../../components/ui/PillButton';
import { SampleTag } from '../../components/ui/Chip';
import { inr, range } from '../../utils/format';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import NotFound from '../NotFound';

export const modules = [
  { key: 'flights', title: 'module.flights', Icon: Plane },
  { key: 'documents', title: 'module.documents', Icon: FileText },
  { key: 'transportation', title: 'module.transportation', Icon: Car },
  { key: 'accommodation', title: 'module.accommodation', Icon: BedDouble },
  { key: 'budget', title: 'module.budget', Icon: Wallet2 },
  { key: 'experiences', title: 'module.experiences', Icon: Sparkles },
  { key: 'itinerary', title: 'module.itinerary', Icon: CalendarRange },
  { key: 'restaurants', title: 'module.restaurants', Icon: UtensilsCrossed },
] as const;

export type ModuleKey = (typeof modules)[number]['key'];

export default function TripWorkspace() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const data = useTrip(tripId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (data === undefined) return null;
  if (!data) return <NotFound />;
  const { trip } = data;

  const savedOf = (kind: string) => data.bookings.filter((b) => b.kind === kind && b.status === 'suggested').length;
  const withSaved = (text: string, kind: string) => (savedOf(kind) ? `${text} · ${savedOf(kind)} saved` : text);
  const counts: Record<ModuleKey, string> = {
    flights: withSaved(`${data.flights.length} ${data.flights.length === 1 ? 'leg' : 'legs'}`, 'flight'),
    documents: `${data.documents.length} saved`,
    transportation: `${data.transport.length} bookings`,
    accommodation: withSaved(`${data.accommodations.length} stays`, 'hotel'),
    budget: 'True journey cost',
    experiences: `${data.experiences.length} ideas`,
    itinerary: `${data.days.length} days planned`,
    restaurants: `${data.restaurants.length} places`,
  };

  return (
    <div>
      <PageHeader
        back="/trips"
        title={trip.title}
        sub={
          <>
            {trip.from ? `${trip.from} → ${trip.to}` : trip.to} · {range(trip.startDate, trip.endDate)}
          </>
        }
        right={trip.sample ? <SampleTag /> : undefined}
      />
      <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 px-gutter">
        {modules.map(({ key, title, Icon }) => (
          <motion.div key={key} variants={fadeUp}>
            <Tile to={`/trips/${trip.id}/${key}`} pastel={modulePastel[key]} icon={<Icon size={20} />} title={t(title)} sub={counts[key]} />
          </motion.div>
        ))}
      </motion.div>

      {(() => {
        const booked = data.bookings.filter((b) => b.status === 'confirmed' || b.status === 'cancelled');
        return booked.length ? (
          <section className="px-gutter pt-6">
            <h2 className="mb-2 text-xl">Bookings</h2>
            <ul className="divide-y divide-line rounded-md border border-line bg-paper">
              {booked.map((b) => (
                <li key={b.id}>
                  <Link to={`/trips/${trip.id}/bookings/${b.id}`} className="flex min-h-tap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{b.title}</span>
                      <span className="block text-xs text-muted">
                        {inr(b.amount)} · {b.status === 'cancelled' ? `cancelled${b.refundInr ? `, ${inr(b.refundInr)} back` : ''}` : b.bookedViaApp ? 'booked in Voyage' : 'booked elsewhere'}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-ink underline underline-offset-4">{b.status === 'cancelled' ? 'Details' : 'Manage'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })()}

      <div className="px-gutter pt-6">
        {data.flights.length > 0 ? (
          <>
            <PillButton full icon={<Plane size={18} />} onClick={() => navigate(`/trips/${trip.id}/active`)}>
              {t('workspace.startTrip')}
            </PillButton>
            <p className="mt-2 text-center text-xs text-muted">{t('workspace.startTripSub')}</p>
          </>
        ) : (
          <p className="text-center text-sm text-muted">Saved to your account. Add flights and a stay to start the trip day by day.</p>
        )}
        {!trip.sample && (
          <div className="mt-6 text-center">
            {confirmDelete ? (
              <p className="text-sm text-ink">
                Delete this trip?{' '}
                <button
                  className="min-h-tap px-2 font-semibold text-bad underline underline-offset-4"
                  onClick={async () => {
                    await deleteTrip(trip);
                    navigate('/trips', { replace: true });
                  }}
                >
                  Delete
                </button>
                <button className="min-h-tap px-2 text-espresso underline underline-offset-4" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </p>
            ) : (
              <button className="min-h-tap text-sm text-muted underline underline-offset-4" onClick={() => setConfirmDelete(true)}>
                Delete trip
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
