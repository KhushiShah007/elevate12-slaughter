import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { disruptions } from '../../data/sampleDisruptions';
import type { DisruptionType } from '../../types';
import { PageHeader } from '../../components/layout/PageHeader';
import { CascadeTimeline } from '../../components/disruption/CascadeTimeline';
import { OptionCard } from '../../components/disruption/OptionCard';
import { RecheckDiff } from '../../components/disruption/RecheckDiff';
import { PillButton } from '../../components/ui/PillButton';
import { Chip, SampleTag } from '../../components/ui/Chip';
import { StampThump } from '../../components/motion/StampThump';
import { fadeUp } from '../../design/motion';
import NotFound from '../NotFound';

type Stage = 'choose' | 'rechecked' | 'confirmed';

// Keyed by type so switching scenarios (e.g. from Judge Mode) starts fresh.
export default function Disruption() {
  const { type } = useParams();
  return <DisruptionView key={type} />;
}

function DisruptionView() {
  const { tripId, type } = useParams();
  const navigate = useNavigate();
  const d = disruptions[type as DisruptionType];
  const [selected, setSelected] = useState<string | null>(d?.options[0]?.id ?? null);
  const [stage, setStage] = useState<Stage>('choose');
  if (!d) return <NotFound />;

  const option = d.options.find((o) => o.id === selected);

  return (
    <div>
      <PageHeader back={`/trips/${tripId}/active`} title={d.type === 'layover' ? 'Layover help' : 'What breaks'} right={<SampleTag />} />

      <div className="space-y-6 px-gutter">
        <CascadeTimeline d={d} />

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-xl">Your options, ranked</h2>
            <span className="text-xs text-muted">by cost + time</span>
          </div>
          <div className="space-y-3">
            {d.options.map((o, i) => (
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
                <PillButton onClick={() => setStage('confirmed')}>Confirm this option</PillButton>
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
                Simulated confirmation. No real booking was changed: there is no provider confirmation in this prototype.
              </p>
              <PillButton full className="mt-5" onClick={() => navigate(`/trips/${tripId}/active`)}>
                Back to my trip
              </PillButton>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
