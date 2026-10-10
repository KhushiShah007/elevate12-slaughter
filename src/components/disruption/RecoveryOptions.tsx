import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, WifiOff } from 'lucide-react';
import { recoveryCandidates } from '../../data/sampleDisruptions';
import type { DisruptionType, RecheckResult } from '../../types';
import type { TripBundle } from '../../db/repos/trips';
import { rankOptions, recheckRows, withRecheck, type RankContext } from '../../engines/ranking';
import { confirmRecovery, getChosenRecovery } from '../../db/repos/bookings';
import { useLiveQuery } from 'dexie-react-hooks';
import { recheckWithProvider } from '../../db/mockProvider';
import { useOnline } from '../../hooks/useOnline';
import { useReworded } from '../../hooks/useReworded';
import { useTranslated } from '../../hooks/useTranslated';
import { usePersona } from '../../hooks/usePersona';
import { fadeUp } from '../../design/motion';
import { inr } from '../../utils/format';
import { OptionCard } from './OptionCard';
import { RecheckDiff } from './RecheckDiff';
import { PillButton } from '../ui/PillButton';
import { Chip, SampleTag } from '../ui/Chip';
import { StampThump } from '../motion/StampThump';
import { useT } from '../../i18n';

type Stage = 'choose' | 'checking' | 'rechecked' | 'confirmed';

const wordingLabel = { ai: 'options.wordingAi', cache: 'options.wordingCache', template: 'options.wordingTemplate' } as const;

/** Ranked options -> recheck with the provider -> confirm. Nothing is applied before confirm. */
export function RecoveryOptions({ bundle, type, fixKey }: { bundle: TripBundle; type: DisruptionType; fixKey: string }) {
  const navigate = useNavigate();
  const online = useOnline();
  const { t, lang } = useT();
  const [rechecks, setRechecks] = useState<Record<string, RecheckResult>>({});
  const [stage, setStage] = useState<Stage>('choose');
  const [error, setError] = useState<string | null>(null);

  const tripId = bundle.trip.id;
  const valueOfHourInr = usePersona()?.persona.valueOfHourInr;
  const candidates = useMemo(() => recoveryCandidates.filter((c) => c.tripId === tripId && c.appliesTo.includes(type)), [tripId, type]);
  // undefined while loading; null when nothing has been chosen for this disruption yet.
  const already = useLiveQuery(() => getChosenRecovery(tripId, fixKey), [tripId, fixKey]);
  const ctx: RankContext = useMemo(
    () => ({
      travellers: bundle.trip.travellers,
      originalArrival: bundle.flights[bundle.flights.length - 1]?.arrive ?? bundle.trip.startDate,
      firstStay: bundle.accommodations[0],
      transport: bundle.transport,
      valueOfHourInr, // a saver ranks cheap options higher, a "treat" persona the fast ones
    }),
    [bundle, valueOfHourInr],
  );

  // Ranked with every recheck applied so far; sold-out options drop out of the ranking.
  const ranked = useMemo(
    () => rankOptions(candidates.filter((c) => !rechecks[c.id]?.soldOut).map((c) => withRecheck(c, rechecks[c.id])), ctx),
    [candidates, rechecks, ctx],
  );
  const gone = candidates.filter((c) => rechecks[c.id]?.soldOut);
  const [selected, setSelected] = useState<string | null>(ranked[0]?.candidate.id ?? null);
  const chosen = ranked.find((r) => r.candidate.id === selected) ?? null;

  // English: AI rewords the reasons. Other languages: AI translates titles and reasons instead.
  const { textFor, source } = useReworded(lang === 'en' ? ranked.map((r) => ({ id: r.candidate.id, text: r.why })) : []);
  const { tr, inEnglish } = useTranslated(
    ranked.flatMap((r) => [
      { id: `${r.candidate.id}.title`, text: r.candidate.title },
      { id: `${r.candidate.id}.why`, text: r.why },
    ]),
  );
  const whyFor = (id: string, why: string) => (lang === 'en' ? textFor(id, why) : tr(`${id}.why`, why));

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
      setError(t('options.recheckFailed'));
      setStage('choose');
    }
  };

  if (already === undefined) return null;

  if (!candidates.length) {
    return (
      <p className="rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed text-espresso">
        {t('options.none')}
      </p>
    );
  }

  // Already fixed: show the plan instead of offering to book it again.
  if (already && stage !== 'confirmed') {
    return (
      <section className="flex items-start gap-4 rounded-lg border border-line bg-mint p-4">
        <StampThump label="Chosen" sub="simulated" tone="ok" size="md" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">{t('options.yourPlan')}</p>
          <p className="mt-1 font-display text-lg leading-snug text-ink">{already.title}</p>
          <p className="mt-1 text-sm text-espresso">{t('options.planPaid', { amount: inr(already.amount) })}</p>
        </div>
      </section>
    );
  }

  if (stage === 'confirmed' && chosen) {
    return (
      <motion.section variants={fadeUp} initial="hidden" animate="show" className="flex flex-col items-center rounded-lg border border-line bg-mint p-6 text-center">
        <StampThump label="Chosen" sub="simulated" tone="ok" size="lg" />
        <p className="mt-4 font-display text-xl text-ink">{chosen.candidate.title}</p>
        <p className="mt-1 text-sm text-espresso">
          {t('options.paidNow', { total: inr(chosen.total), paid: inr(chosen.newSpend) })}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-espresso">
          {t('options.chosen')}
        </p>
        <PillButton full className="mt-5" onClick={() => navigate(`/trips/${bundle.trip.id}/active`)}>
          {t('options.backToTrip')}
        </PillButton>
      </motion.section>
    );
  }

  return (
    <>
      <section>
        <div className="mb-1 flex items-end justify-between">
          <h2 className="text-xl">{t('options.title')}</h2>
          <SampleTag />
        </div>
        <p className="mb-3 text-xs text-muted">{t('options.by')} {lang === 'en' ? `${t(wordingLabel[source])}.` : inEnglish ? t('common.detailsInEnglish') : ''}</p>
        <div className="space-y-3">
          {ranked.map((o) => (
            <OptionCard
              key={o.candidate.id}
              option={o}
              title={tr(`${o.candidate.id}.title`, o.candidate.title)}
              why={whyFor(o.candidate.id, o.why)}
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
                {t('tag.soldOut')}
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
              {stage === 'checking' ? t('options.checking') : t('options.recheck')}
            </PillButton>
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted">
              {online ? (
                t('options.nothingChanges')
              ) : (
                <>
                  <WifiOff size={12} /> {t('options.recheckOffline')}
                </>
              )}
            </p>
            {error && <p className="mt-2 text-center text-sm text-bad">{error}</p>}
          </motion.div>
        )}

        {stage === 'rechecked' && lastCheck && (
          <motion.section key="rechecked" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl">{t('options.whatChanged')}</h2>
              <Chip tone="warn" dot>
                {t('options.simRecheck')}
              </Chip>
            </div>
            {lastCheck.soldOut ? (
              <div className="rounded-lg border border-bad/30 bg-rose p-4 text-sm text-ink">
                <p className="font-semibold">{t('options.soldOutTitle')}</p>
                <p className="mt-1 text-espresso">{t('options.soldOutBody')}</p>
                <PillButton
                  full
                  className="mt-3"
                  onClick={() => {
                    setSelected(ranked[0]?.candidate.id ?? null);
                    setStage('choose');
                  }}
                >
                  {t('options.pickNew')}
                </PillButton>
              </div>
            ) : (
              <>
                <RecheckDiff rows={rows} />
                <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
                  <PillButton variant="ghost" onClick={() => setStage('choose')}>
                    {t('common.back')}
                  </PillButton>
                  <PillButton
                    onClick={async () => {
                      if (!chosen) return;
                      await confirmRecovery(bundle.trip.id, chosen.candidate.title, chosen.newSpend, fixKey);
                      setStage('confirmed');
                    }}
                  >
                    {chosen?.newSpend ? t('options.confirmPay', { amount: inr(chosen.newSpend) }) : t('options.confirm')}
                  </PillButton>
                </div>
                <p className="mt-2 text-center text-xs text-muted">{t('options.simNote')}</p>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
