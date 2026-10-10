import { useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { disruptionLabels } from '../../data/sampleDisruptions';
import type { DisruptionType } from '../../types';
import { useCascade } from '../../hooks/useCascade';
import { PageHeader } from '../../components/layout/PageHeader';
import { CascadeTimeline } from '../../components/disruption/CascadeTimeline';
import { StatusControl } from '../../components/disruption/StatusControl';
import { RecoveryOptions } from '../../components/disruption/RecoveryOptions';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';
import { clearDisruption, setDelay, setMissed, setPrepone } from '../../db/repos/status';
import NotFound from '../NotFound';

const titles: Record<DisruptionType, string> = {
  delay: 'What breaks',
  preponed: 'What moves',
  missed: 'What breaks',
  connecting: 'Your connection',
  layover: 'Layover help',
};

// Keyed by type so switching scenarios (e.g. from Judge Mode) starts fresh.
export default function Disruption() {
  const { type } = useParams();
  return <DisruptionView key={type} />;
}

function DisruptionView() {
  const { tripId, type: rawType } = useParams();
  const type = rawType as DisruptionType;
  const view = useCascade(tripId, type);

  if (!(type in titles)) return <NotFound />;
  if (view === undefined) return null;
  if (!view) return <NotFound />;

  const { bundle, result, minutes, status } = view;
  const [first] = bundle.flights;

  // Recovery options only make sense when something actually needs fixing.
  const needsFix =
    type === 'connecting' || type === 'layover' ? true : !!result && (!!result.brokenAt || result.effects.some((e) => e.level === 'bad'));

  return (
    <div>
      <PageHeader back={`/trips/${tripId}/active`} title={titles[type]} sub={disruptionLabels[type]} />

      <div className="space-y-6 px-gutter">
        {(type === 'delay' || type === 'preponed') && first && (
          <StatusControl
            question={type === 'delay' ? 'How late is' : 'How much earlier is'}
            flightNo={first.flightNo}
            minutes={minutes}
            source={status?.source ?? 'sample'}
            presets={type === 'delay' ? [30, 70, 160] : [30, 50]}
            onChange={(m) => void (type === 'delay' ? setDelay(bundle.trip.id, first.id, m) : setPrepone(bundle.trip.id, first.id, m))}
            onClear={() => void clearDisruption(bundle.trip.id)}
          />
        )}

        {(type === 'connecting' || type === 'layover') && bundle.flights.length < 2 && (
          <div className="flex items-start gap-3 rounded-lg border border-ok/30 bg-mint p-4">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok" />
            <p className="text-sm leading-relaxed text-ink">This trip is a direct flight, so there is no connection or layover to plan.</p>
          </div>
        )}

        {type === 'missed' && !result && (
          <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
            <p className="font-display text-xl text-ink">Which flight did you miss?</p>
            <div className="mt-3 space-y-2">
              {bundle.flights.map((f) => (
                <PillButton key={f.id} full variant="ghost" onClick={() => void setMissed(bundle.trip.id, f.id)}>
                  {f.flightNo} · {f.fromCode} → {f.toCode}
                </PillButton>
              ))}
            </div>
          </div>
        )}

        {result && (
          // Keyed on the headline so the ripple and stagger replay when the input changes.
          <div key={`cascade:${result.headline}`}>
            <CascadeTimeline d={result} />
            <div className="mt-2 flex items-center justify-between px-1">
              <Chip>Worked out on this phone</Chip>
              {type === 'missed' && (
                <button onClick={() => void clearDisruption(bundle.trip.id)} className="min-h-[2.5rem] px-1 text-sm text-espresso underline underline-offset-4">
                  I didn't miss it
                </button>
              )}
            </div>
          </div>
        )}

        {result && !needsFix && (
          <div className="flex items-start gap-3 rounded-lg border border-ok/30 bg-mint p-4">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok" />
            <p className="text-sm leading-relaxed text-ink">
              {minutes === 0 && (type === 'delay' || type === 'preponed')
                ? 'Nothing to fix yet. Set how late the flight is and we will show what it affects.'
                : result.effects.some((e) => e.level === 'warn')
                  ? 'Nothing breaks. Keep an eye on the amber items above.'
                  : 'Nothing else on this trip depends on this flight, so nothing breaks.'}
            </p>
          </div>
        )}

        {/* A new disruption starts a fresh choice: keyed on what broke. */}
        {result && needsFix && <RecoveryOptions key={`options:${result.headline}`} bundle={bundle} type={type} fixKey={`${type}:${result.headline}`} />}
      </div>
    </div>
  );
}
