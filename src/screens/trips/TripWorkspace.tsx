import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BedDouble, CalendarRange, Car, FileText, Plane, Sparkles, UtensilsCrossed, Wallet2 } from 'lucide-react';
import { useTrip } from '../../hooks/useTrip';
import { modulePastel } from '../../design/tokens';
import { fadeUp, stagger } from '../../design/motion';
import { PageHeader } from '../../components/layout/PageHeader';
import { Tile } from '../../components/ui/Tile';
import { PillButton } from '../../components/ui/PillButton';
import { SampleTag } from '../../components/ui/Chip';
import { range } from '../../utils/format';
import NotFound from '../NotFound';

export const modules = [
  { key: 'flights', title: 'Flights', Icon: Plane },
  { key: 'documents', title: 'Documents', Icon: FileText },
  { key: 'transportation', title: 'Transportation', Icon: Car },
  { key: 'accommodation', title: 'Accommodation', Icon: BedDouble },
  { key: 'budget', title: 'Budget', Icon: Wallet2 },
  { key: 'experiences', title: 'Experiences', Icon: Sparkles },
  { key: 'itinerary', title: 'Itinerary', Icon: CalendarRange },
  { key: 'restaurants', title: 'Restaurants & Cafes', Icon: UtensilsCrossed },
] as const;

export type ModuleKey = (typeof modules)[number]['key'];

export default function TripWorkspace() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const data = useTrip(tripId);
  if (!data) return <NotFound />;
  const { trip } = data;

  const counts: Record<ModuleKey, string> = {
    flights: `${data.flights.length} legs`,
    documents: `${data.documents.length} saved`,
    transportation: `${data.transport.length} bookings`,
    accommodation: `${data.accommodations.length} stays`,
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
            {trip.from} → {trip.to} · {range(trip.startDate, trip.endDate)}
          </>
        }
        right={<SampleTag />}
      />
      <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 px-gutter">
        {modules.map(({ key, title, Icon }) => (
          <motion.div key={key} variants={fadeUp}>
            <Tile to={`/trips/${trip.id}/${key}`} pastel={modulePastel[key]} icon={<Icon size={20} />} title={title} sub={counts[key]} />
          </motion.div>
        ))}
      </motion.div>

      <div className="px-gutter pt-6">
        <PillButton full icon={<Plane size={18} />} onClick={() => navigate(`/trips/${trip.id}/active`)}>
          Start trip
        </PillButton>
        <p className="mt-2 text-center text-xs text-muted">Turns on the airport timeline and emergency help.</p>
      </div>
    </div>
  );
}
