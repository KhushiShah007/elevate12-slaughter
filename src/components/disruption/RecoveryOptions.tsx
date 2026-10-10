import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, WifiOff } from 'lucide-react';
import { recoveryCandidates } from '../../data/sampleDisruptions';
import type { DisruptionType, RecheckResult } from '../../types';
import type { TripBundle } from '../../db/repos/trips';
import { rankOptions, recheckRows, withRecheck, type RankContext } from '../../engines/ranking';
import { confirmRecovery } from '../../db/repos/bookings';
import { recheckWithProvider } from '../../db/mockProvider';
import { useOnline } from '../../hooks/useOnline';
import { useReworded } from '../../hooks/useReworded';
import { fadeUp } from '../../design/motion';
import { inr } from '../../utils/format';
import { OptionCard } from './OptionCard';
import { RecheckDiff } from './RecheckDiff';
import { PillButton } from '../ui/PillButton';
import { Chip, SampleTag } from '../ui/Chip';
import { StampThump } from '../motion/StampThump';

type Stage = 'choose' | 'checking' | 'rechecked' | 'confirmed';

const wordingLabel = { ai: 'Reasons worded by AI (Groq)', cache: 'AI wording, saved on phone', template: 'Reasons worded on this phone' };

/** Ranked options -> recheck with the provider -> confirm. Nothing is applied before confirm. */
export function RecoveryOptions({ bundle, type }: { bundle: TripBundle; type: DisruptionType }) {
  const navigate = useNavigate();
  const online = useOnline();
  const [rechecks, setRechecks] = useState<Record<string, RecheckResult>>({});
  const [stage, setStage] = useState<Stage>('choose');
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => recoveryCandidates.filter((c) => c.appliesTo.includes(type)), [type]);
  const ctx: RankContext = useMemo(
    () => ({
      travellers: bundle.trip.travellers,
      originalArrival: bundle.flights[bundle.flights.length - 1]?.arrive ?? bundle.trip.startDate,
      firstStay: bundle.accommodations[0],
      transport: bundle.transport,
    }),
    [bundle],
  );

  // Ranked with every recheck applied so far; sold-out options drop out of the ranking.
  const ranked = useMemo(
    () => rankOptions(candidates.filter((c) => !rechecks[c.id]?.soldOut).map((c) => withRecheck(c, rechecks[c.id])), ctx),
    [candidates, rechecks, ctx],
  );
  const gone = candidates.filter((c) => rechecks[c.id]?.soldOut);
  const [selected, setSelected] = useState<string | null>(ranked[0]?.candidate.id ?? null);
  const chosen = ranked.find((r) => r.candidate.id === selected) ?? null;

  const { textFor, source } = useReworded(ranked.map((r) => ({ id: r.candidate.id, text: r.why })));

  const lastCheck = selected ? rechecks[selected] : undefined;
  const rows = useMemo(() => {
    if (!selected || !lastCheck) return [];
    const others = { ...rechecks };
    delete others[selected];
    const before = rankOptions(candidates.filter((c) => !others[c.id]?.soldOut).map((c) => withRecheck(c, others[c.id])), ctx).find(
      (r) => r.candidate.id === selected,
    );
    return before ? recheckRows(before, chosen, lastCheck) : [];
  }, [selected, lastCheck, rechecks, candidates, ctx, chosen]);

  const recheck = async () => {
    const c = candidates.find((x) => x.id === selected);
    if (!c) return;
    setError(null);
    setStage('checking');
    try {
      const r = await recheckWithProvider(c);
      setRechecks((all) => ({ ...all, [c.id]: r }));
      setStage('rechecked');
    } catch {
      setError('Rechecking needs internet. Nothing has been booked.');
      setStage('choose');
    }
  };

  if (stage === 'confirmed' && chosen) {
    return (
      <motion.section variants={fadeUp} initial="hidden" animate="show" className="flex flex-col items-center rounded-lg border border-line bg-mint p-6 text-center">
        <StampThump label="Chosen" sub="simulated" tone="ok" size="lg" />
        <p className="mt-4 font-display text-xl text-ink">{chosen.candidate.title}</p>
        <p className="mt-1 text-sm text-espresso">
          True cost {inr(chosen.total)} · paid now {inr(chosen.newSpend)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-espresso">
          Saved on this phone as a simulated booking. No real booking was changed: there is no provider confirmation in this prototype.
        </p>
        <PillButton full className="mt-5" onClick={() => navigate(`/trips/${bundle.trip.id}/active`)}>
          Back to my trip
        </PillButton>
      </motion.section>
    );
  }

  return (
    <>
      <section>
        <div className="mb-1 flex items-end justify-between">
          <h2 className="text-xl">Your options, ranked</h2>
          <SampleTag />
        </div>
        <p className="mb-3 text-xs text-muted">By true cost plus the time you lose. {wordingLabel[source]}.</p>
        <div className="space-y-3">
          {ranked.map((o) => (
            <OptionCard
              key={o.candidate.id}
              option={o}
              why={textFor(o.candidate.id, o.why)}
              selected={o.candidate.id === selected}
              onSelect={() => {
                setSelected(o.candidate.id);
                setStage(rechecks[o.candidate.id] ? 'rechecked' : 'choose');
              }}
            />
          ))}
          {gone.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-line bg-sand/50 px-4 py-3 text-sm text-espresso">
              <span className="line-through">{c.title}</span>
              <Chip tone="bad" dot>
                Sold out
              </Chip>
            </div>
          ))}
        </div>
      </section>

      <AnimatePresence mode="wait">
        {chosen && (stage === 'choose' || stage === 'checking') && (
          <motion.div key="choose" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }}>
            <PillButton
              full
              disabled={!online || stage === 'checking'}
              icon={<RefreshCw size={18} className={stage === 'checking' ? 'animate-spin' : ''} />}
              onClick={() => void recheck()}
            >
              {stage === 'checking' ? 'Checking with the provider…' : 'Recheck price & seats'}
            </PillButton>
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted">
              {online ? (
                'Nothing changes until you confirm.'
              ) : (
                <>
                  <WifiOff size={12} /> Rechecking needs internet. Prices shown are from the last check.
                </>
              )}
            </p>
            {error && <p className="mt-2 text-center text-sm text-bad">{error}</p>}
          </motion.div>
        )}

        {stage === 'rechecked' && lastCheck && (
          <motion.section key="rechecked" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl">What changed</h2>
              <Chip tone="warn" dot>
                Simulated recheck
              </Chip>
            </div>
            {lastCheck.soldOut ? (
              <div className="rounded-lg border border-bad/30 bg-rose p-4 text-sm text-ink">
                <p className="font-semibold">Sold out since the last check.</p>
                <p className="mt-1 text-espresso">Nothing was booked. The list above has been re-ranked without it.</p>
                <PillButton
                  full
                  className="mt-3"
                  onClick={() => {
                    setSelected(ranked[0]?.candidate.id ?? null);
                    setStage('choose');
                  }}
                >
                  Pick the new best option
                </PillButton>
              </div>
            ) : (
              <>
                <RecheckDiff rows={rows} />
                <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
                  <PillButton variant="ghost" onClick={() => setStage('choose')}>
                    Back
                  </PillButton>
                  <PillButton
                    onClick={async () => {
                      if (!chosen) return;
                      await confirmRecovery(bundle.trip.id, chosen.candidate.title, chosen.newSpend);
                      setStage('confirmed');
                    }}
                  >
                    {chosen?.newSpend ? `Confirm · pay ${inr(chosen.newSpend)}` : 'Confirm'}
                  </PillButton>
                </div>
                <p className="mt-2 text-center text-xs text-muted">Simulated: no money moves and no real booking is made.</p>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
