import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { disruptionLabels, recoveryOptions } from '../../data/sampleDisruptions';
import type { DisruptionType } from '../../types';
import { useCascade } from '../../hooks/useCascade';
import { PageHeader } from '../../components/layout/PageHeader';
import { CascadeTimeline } from '../../components/disruption/CascadeTimeline';
import { StatusControl } from '../../components/disruption/StatusControl';
import { OptionCard } from '../../components/disruption/OptionCard';
import { RecheckDiff } from '../../components/disruption/RecheckDiff';
import { PillButton } from '../../components/ui/PillButton';
import { Chip, SampleTag } from '../../components/ui/Chip';
import { StampThump } from '../../components/motion/StampThump';
import { fadeUp } from '../../design/motion';
import { confirmRecovery } from '../../db/repos/bookings';
import { clearDisruption, setDelay, setMissed, setPrepone } from '../../db/repos/status';
import NotFound from '../NotFound';

type Stage = 'choose' | 'rechecked' | 'confirmed';

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
  const navigate = useNavigate();
  const view = useCascade(tripId, type);
  const options = recoveryOptions[type];
  const [selected, setSelected] = useState<string | null>(options?.[0]?.id ?? null);
  const [stage, setStage] = useState<Stage>('choose');

  if (!options) return <NotFound />;
  if (view === undefined) return null;
  if (!view) return <NotFound />;

  const { bundle, result, minutes, status } = view;
  const [first] = bundle.flights;
  const option = options.find((o) => o.id === selected);

  // Recovery options only make sense when something actually needs fixing.
  const needsFix =
    type === 'connecting' || type === 'layover' ? true : !!result && (!!result.brokenAt || result.effects.some((e) => e.level === 'bad'));

  const resetChoice = () => {
    setStage('choose');
    setSelected(options[0]?.id ?? null);
  };

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
            onChange={(m) => {
              resetChoice();
              void (type === 'delay' ? setDelay(bundle.trip.id, first.id, m) : setPrepone(bundle.trip.id, first.id, m));
            }}
            onClear={() => {
              resetChoice();
              void clearDisruption(bundle.trip.id);
            }}
          />
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
          <div key={result.headline}>
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
              {minutes === 0 ? 'Nothing to fix yet. Set how late the flight is and we will show what it affects.' : 'Nothing breaks. Keep an eye on the amber items above.'}
            </p>
          </div>
        )}

        {result && needsFix && (
          <>
            <section>
              <div className="mb-3 flex items-end justify-between">
                <h2 className="text-xl">Your options, ranked</h2>
                <SampleTag />
              </div>
              <div className="space-y-3">
                {options.map((o, i) => (
                  <OptionCard
                    key={o.id}
                    option={o}
                    rank={i + 1}
                    selected={o.id === selected}
                    onSelect={() => {
                      setSelected(o.id);
                      setStage('choose');
                    }}
                  />
                ))}
              </div>
            </section>

            <AnimatePresence mode="wait">
              {option && stage === 'choose' && (
                <motion.div key="choose" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }}>
                  <PillButton full icon={<RefreshCw size={18} />} onClick={() => setStage('rechecked')}>
                    Recheck price & seats
                  </PillButton>
                  <p className="mt-2 text-center text-xs text-muted">Nothing changes until you confirm.</p>
                </motion.div>
              )}

              {option && stage === 'rechecked' && (
                <motion.section key="rechecked" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl">What changed</h2>
                    <Chip tone="warn" dot>
                      Simulated recheck
                    </Chip>
                  </div>
                  <RecheckDiff rows={option.recheck} />
                  <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
                    <PillButton variant="ghost" onClick={() => setStage('choose')}>
                      Back
                    </PillButton>
                    <PillButton
                      onClick={async () => {
                        await confirmRecovery(bundle.trip.id, option);
                        setStage('confirmed');
                      }}
                    >
                      Confirm this option
                    </PillButton>
                  </div>
                </motion.section>
              )}

              {option && stage === 'confirmed' && (
                <motion.section
                  key="confirmed"
                  variants={fadeUp}
                  initial="hidden"
                  animate="show"
                  className="flex flex-col items-center rounded-lg border border-line bg-mint p-6 text-center"
                >
                  <StampThump label="Chosen" sub="simulated" tone="ok" size="lg" />
                  <p className="mt-4 font-display text-xl text-ink">{option.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-espresso">
                    Saved on this phone as a simulated booking. No real booking was changed: there is no provider confirmation in this prototype.
                  </p>
                  <PillButton full className="mt-5" onClick={() => navigate(`/trips/${tripId}/active`)}>
                    Back to my trip
                  </PillButton>
                </motion.section>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
