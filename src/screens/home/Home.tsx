import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, ChevronRight, Luggage, Plus, Stamp, Wifi, WifiOff } from 'lucide-react';
import { useNextFlight, useTrips, useTraveller } from '../../hooks/useTrip';
import { useOnline } from '../../hooks/useOnline';
import { fadeUp, stagger } from '../../design/motion';
import { BoardingPassCard } from '../../components/flight/BoardingPassCard';
import { Tile } from '../../components/ui/Tile';
import { Chip, SampleTag } from '../../components/ui/Chip';
import { SourceChip } from '../../components/layout/SourceChip';
import { SyncStatus } from '../../components/layout/SyncStatus';
import { clock, day, greeting, localTime } from '../../utils/format';

const screenFor = { delay: 'delay', prepone: 'preponed', missed: 'missed' } as const;

export default function Home() {
  const online = useOnline();
  const traveller = useTraveller();
  const next = useNextFlight();
  const trips = useTrips();
  if (next === undefined || !trips || !traveller) return null;

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
          <span className="italic">{traveller.name}</span>
        </h1>
        {next && (
          <p className="mt-2 text-sm text-espresso">
            {next.trip.title} starts {day(next.trip.startDate, { weekday: 'long', day: 'numeric', month: 'short' })}.
            {next.leaveHomeAt && (
              <>
                {' '}
                Leave home by <span className="font-semibold text-ink">{next.leaveHomeAt}</span>.
              </>
            )}
          </p>
        )}
        <div className="mt-3">
          <SyncStatus />
        </div>
      </motion.div>

      {next && (
        <motion.section variants={fadeUp} className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl">Next flight</h2>
            <SampleTag />
          </div>
          {next.event && (
            <Link
              to={`/trips/${next.trip.id}/disruption/${screenFor[next.event.kind]}`}
              className="mb-3 flex min-h-tap items-center gap-3 rounded-lg border border-bad/30 bg-rose px-4 py-3 shadow-card"
            >
              <AlertTriangle size={20} className="shrink-0 text-bad" />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg leading-tight text-ink">{next.headline}</span>
                <span className="text-xs text-espresso">See what it affects and your options</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-espresso" />
            </Link>
          )}
          <Link to={`/trips/${next.trip.id}/flights`} className="block">
            <BoardingPassCard
              flight={next.leg}
              risk={next.risk}
              pastel="sky"
              footer={
                next.status && (
                  <span className="text-[0.6875rem] text-muted">
                    {next.status.source === 'simulated' ? 'Simulated' : next.status.source === 'reported' ? 'Reported by you' : 'Last synced'} {localTime(next.status.lastSynced)}
                  </span>
                )
              }
            />
          </Link>
          {next.onward && (
            <p className="mt-2 px-1 text-xs text-muted">
              Then {next.onward.flightNo} to {next.onward.toCity} at {clock(next.onward.depart)}
            </p>
          )}
        </motion.section>
      )}

      <motion.section variants={fadeUp} className="mt-8">
        <h2 className="mb-3 text-xl">Your trips</h2>
        <div className="grid grid-cols-2 gap-3">
          <Tile to="/trips" pastel="peach" icon={<Luggage size={20} />} title="Existing trips" sub={`${trips.existing.length} coming up`} />
          <Tile to="/trips/new" pastel="lavender" icon={<Plus size={20} />} title="New trip" sub="Plan or paste a booking" />
          <Tile
            to="/trips?tab=completed"
            pastel="butter"
            icon={<Stamp size={20} />}
            title="Completed trips"
            sub={`${trips.completed.length} stamps collected`}
            className="col-span-2 min-h-[6rem]"
          />
        </div>
      </motion.section>

      {next && (
        <motion.div variants={fadeUp} className="mt-6">
          <Link
            to={`/trips/${next.trip.id}`}
            className="flex min-h-tap items-center justify-between rounded-pill border border-line bg-paper px-5 text-sm font-medium text-ink"
          >
            Open {next.trip.title} workspace <ArrowRight size={18} />
          </Link>
        </motion.div>
      )}
    </motion.div>
  );
}
