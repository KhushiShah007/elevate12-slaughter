import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Luggage, Plus, Stamp, Wifi, WifiOff } from 'lucide-react';
import { useNextFlight, useTrips, sampleUser, journeySteps } from '../../hooks/useTrip';
import { useOnline } from '../../hooks/useOnline';
import { fadeUp, stagger } from '../../design/motion';
import { BoardingPassCard } from '../../components/flight/BoardingPassCard';
import { Tile } from '../../components/ui/Tile';
import { Chip, SampleTag } from '../../components/ui/Chip';
import { SourceChip } from '../../components/layout/SourceChip';
import { clock, day, greeting } from '../../utils/format';

export default function Home() {
  const online = useOnline();
  const { trip, leg, onward, risk, lastSynced } = useNextFlight();
  const { existing, completed } = useTrips();

  return (
    <motion.div variants={stagger()} initial="hidden" animate="show" className="px-gutter">
      <motion.div variants={fadeUp} className="pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {online ? (
            <Chip tone="ok" dot icon={<Wifi size={12} />}>
              Online
            </Chip>
          ) : (
            <Chip tone="warn" dot icon={<WifiOff size={12} />}>
              Offline
            </Chip>
          )}
          <SourceChip source="device" />
        </div>
        <h1 className="mt-4 text-[2.25rem] leading-[1.1]">
          {greeting()},<br />
          <span className="italic">{sampleUser.name}</span>
        </h1>
        <p className="mt-2 text-sm text-espresso">
          {trip.title} starts {day(trip.startDate, { weekday: 'long', day: 'numeric', month: 'short' })}. Leave home by{' '}
          <span className="font-semibold text-ink">{journeySteps[0].at}</span>.
        </p>
      </motion.div>

      <motion.section variants={fadeUp} className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl">Next flight</h2>
          <SampleTag />
        </div>
        <Link to={`/trips/${trip.id}/flights`} className="block">
          <BoardingPassCard
            flight={leg}
            risk={risk}
            pastel="sky"
            footer={<span className="text-[0.6875rem] text-muted">Last synced {clock(lastSynced)}</span>}
          />
        </Link>
        {onward && (
          <p className="mt-2 px-1 text-xs text-muted">
            Then {onward.flightNo} to {onward.toCity} at {clock(onward.depart)}
          </p>
        )}
      </motion.section>

      <motion.section variants={fadeUp} className="mt-8">
        <h2 className="mb-3 text-xl">Your trips</h2>
        <div className="grid grid-cols-2 gap-3">
          <Tile to="/trips" pastel="peach" icon={<Luggage size={20} />} title="Existing trips" sub={`${existing.length} coming up`} />
          <Tile to="/trips/new" pastel="lavender" icon={<Plus size={20} />} title="New trip" sub="Plan or paste a booking" />
          <Tile
            to="/trips?tab=completed"
            pastel="butter"
            icon={<Stamp size={20} />}
            title="Completed trips"
            sub={`${completed.length} stamps collected`}
            className="col-span-2 min-h-[6rem]"
          />
        </div>
      </motion.section>

      <motion.div variants={fadeUp} className="mt-6">
        <Link
          to={`/trips/${trip.id}`}
          className="flex min-h-tap items-center justify-between rounded-pill border border-line bg-paper px-5 text-sm font-medium text-ink"
        >
          Open {trip.title} workspace <ArrowRight size={18} />
        </Link>
      </motion.div>
    </motion.div>
  );
}
