import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, ChevronRight, Compass, Luggage, Plus, Stamp, Wifi, WifiOff } from 'lucide-react';
import { useNextFlight, useTrips, useTraveller } from '../../hooks/useTrip';
import { useOnline } from '../../hooks/useOnline';
import { fadeUp, stagger } from '../../design/motion';
import { BoardingPassCard } from '../../components/flight/BoardingPassCard';
import { Tile } from '../../components/ui/Tile';
import { Chip, SampleTag } from '../../components/ui/Chip';
import { SourceChip } from '../../components/layout/SourceChip';
import { SyncStatus } from '../../components/layout/SyncStatus';
import { clock, day, greetingKey, localTime } from '../../utils/format';
import { useT } from '../../i18n';
import { useTranslated } from '../../hooks/useTranslated';

const screenFor = { delay: 'delay', prepone: 'preponed', missed: 'missed' } as const;

export default function Home() {
  const online = useOnline();
  const { t, info } = useT();
  const traveller = useTraveller();
  const next = useNextFlight();
  const trips = useTrips();
  const { tr } = useTranslated(next?.event ? [{ id: 'headline', text: next.headline }] : []);
  if (next === undefined || !trips || !traveller) return null;

  return (
    <motion.div variants={stagger()} initial="hidden" animate="show" className="px-gutter">
      <motion.div variants={fadeUp} className="pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {online ? (
            <Chip tone="ok" dot icon={<Wifi size={12} />}>
              {t('home.online')}
            </Chip>
          ) : (
            <Chip tone="warn" dot icon={<WifiOff size={12} />}>
              {t('home.offline')}
            </Chip>
          )}
          <SourceChip source="device" />
        </div>
        <h1 className="mt-4 text-[2.25rem] leading-[1.1]">
          {t(greetingKey())},<br />
          <span className="italic">{traveller.name}</span>
        </h1>
        {next && (
          <p className="mt-2 text-sm text-espresso">
            {t('home.starts', { trip: next.trip.title, date: day(next.trip.startDate, { weekday: 'long', day: 'numeric', month: 'short' }, info.intl) })}
            {next.leaveHomeAt && (
              <>
                {' '}
                <span className="font-semibold text-ink">{t('home.leaveBy', { time: next.leaveHomeAt })}</span>
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
            <h2 className="text-xl">{t('home.nextFlight')}</h2>
            <SampleTag />
          </div>
          {next.event && (
            <Link
              to={`/trips/${next.trip.id}/disruption/${screenFor[next.event.kind]}`}
              className="mb-3 flex min-h-tap items-center gap-3 rounded-lg border border-bad/30 bg-rose px-4 py-3 shadow-card"
            >
              <AlertTriangle size={20} className="shrink-0 text-bad" />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg leading-tight text-ink">{tr('headline', next.headline)}</span>
                <span className="text-xs text-espresso">{t('home.alertSub')}</span>
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
                    {t(next.status.source === 'simulated' ? 'status.simulated' : next.status.source === 'reported' ? 'status.reported' : 'status.lastSynced')} {localTime(next.status.lastSynced)}
                  </span>
                )
              }
            />
          </Link>
          {next.onward && (
            <p className="mt-2 px-1 text-xs text-muted">
              {t('home.then', { flight: next.onward.flightNo, city: next.onward.toCity, time: clock(next.onward.depart) })}
            </p>
          )}
        </motion.section>
      )}

      <motion.section variants={fadeUp} className="mt-8">
        <h2 className="mb-3 text-xl">{t('home.yourTrips')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Tile to="/trips" pastel="peach" icon={<Luggage size={20} />} title={t('home.existingTrips')} sub={t('home.comingUp', { n: trips.existing.length })} />
          <Tile to="/trips/new" pastel="lavender" icon={<Plus size={20} />} title={t('home.newTrip')} sub={t('home.newTripSub')} />
          <Tile
            to="/trips?tab=completed"
            pastel="butter"
            icon={<Stamp size={20} />}
            title={t('home.completedTrips')}
            sub={t('home.stamps', { n: trips.completed.length })}
          />
          <Tile to="/destinations" pastel="mint" icon={<Compass size={20} />} title={t('home.explore')} sub={t('home.exploreSub')} />
        </div>
      </motion.section>

      {next && (
        <motion.div variants={fadeUp} className="mt-6">
          <Link
            to={`/trips/${next.trip.id}`}
            className="flex min-h-tap items-center justify-between rounded-pill border border-line bg-paper px-5 text-sm font-medium text-ink"
          >
            {t('home.openWorkspace', { trip: next.trip.title })} <ArrowRight size={18} />
          </Link>
        </motion.div>
      )}
    </motion.div>
  );
}
