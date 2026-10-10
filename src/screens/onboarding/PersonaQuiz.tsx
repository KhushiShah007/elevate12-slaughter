import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, PencilLine, Type } from 'lucide-react';
import { quizQuestions } from '../../data/quizQuestions';
import { savePreferences } from '../../db/repos/users';
import { derivePersona, type Answers, type Notes } from '../../engines/persona';
import { PillButton } from '../../components/ui/PillButton';
import { StampThump } from '../../components/motion/StampThump';
import { PersonaEffects, PersonaStamp } from '../../components/persona/PersonaCard';
import { useSettings } from '../../state/settings';
import { useT } from '../../i18n';

export default function PersonaQuiz() {
  const navigate = useNavigate();
  const { t } = useT();
  const settings = useSettings();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [notes, setNotes] = useState<Notes>({});
  const [typing, setTyping] = useState(false);
  const done = i >= quizQuestions.length;
  const q = quizQuestions[i];

  const next = () => {
    setTyping(false);
    setTimeout(() => setI((n) => n + 1), 180);
  };

  const pick = (value: string) => {
    setAnswers((a) => ({ ...a, [q.id]: value }));
    next();
  };

  const back = () => {
    setTyping(false);
    if (i === 0) navigate(-1);
    else setI(i - 1);
  };

  if (done) {
    const persona = derivePersona(answers, notes);
    const typed = Object.entries(notes).filter(([k, v]) => v && answers[k as keyof Answers] === 'other');
    return (
      <div className="flex min-h-screen flex-col px-gutter pb-8 pt-12">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted">{t('quiz.resultTitle')}</p>
        <div className="relative mx-auto mt-6">
          <PersonaStamp persona={persona} />
          <div className="absolute -bottom-6 -right-8">
            <StampThump label="Approved" tone="ok" />
          </div>
        </div>

        <section className="mt-10 rounded-lg border border-line bg-paper p-4">
          <h2 className="mb-3 text-lg">{t('quiz.whatChanges')}</h2>
          <PersonaEffects persona={persona} />
          {typed.map(([k, v]) => (
            <p key={k} className="mt-3 flex items-start gap-2 text-xs italic text-espresso">
              <PencilLine size={14} className="mt-0.5 shrink-0" /> {t('quiz.youSaid', { text: v! })}
            </p>
          ))}
        </section>

        {persona.suggestSenior && (
          <button
            onClick={() => settings.update({ seniorMode: !settings.seniorMode })}
            className={`mt-4 flex min-h-tap items-center gap-3 rounded-lg border px-4 text-left text-sm ${settings.seniorMode ? 'border-ok/40 bg-mint' : 'border-line bg-butter'}`}
          >
            <Type size={18} className="shrink-0" />
            {settings.seniorMode ? t('quiz.biggerTextOn') : t('quiz.biggerText')}
          </button>
        )}

        <p className="mt-6 text-center text-xs text-muted">{t('quiz.retakeNote')}</p>
        <div className="mt-auto pt-6">
          <PillButton
            full
            onClick={async () => {
              await savePreferences(answers, notes);
              navigate('/home');
            }}
          >
            {t('quiz.start')}
          </PillButton>
        </div>
      </div>
    );
  }

  const otherText = notes[q.id] ?? '';

  return (
    <div className="flex min-h-screen flex-col px-gutter pb-8 pt-3">
      <div className="flex min-h-tap items-center justify-between">
        <button onClick={back} className="-ml-3 flex min-h-tap items-center pl-1.5 pr-3 text-sm font-medium text-espresso">
          <ChevronLeft size={20} /> {t('common.back')}
        </button>
        <button onClick={() => navigate('/home')} className="min-h-tap px-2 text-sm text-muted">
          Skip
        </button>
      </div>

      <div className="mt-2 flex gap-1.5">
        {quizQuestions.map((qq, n) => (
          <span key={qq.id} className={`h-1.5 flex-1 rounded-full ${n <= i ? 'bg-ink' : 'bg-line'}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
          <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted">
            Question {i + 1} of {quizQuestions.length}
          </p>
          <h1 className="mt-2 text-[2rem] leading-[1.15]">{q.question}</h1>
          <div className="mt-8 space-y-3">
            {q.options.map((o) => {
              const chosen = answers[q.id] === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => pick(o.value)}
                  className={`flex min-h-[4rem] w-full items-center gap-4 rounded-lg border px-4 text-left transition ${
                    chosen ? 'border-ink bg-paper shadow-lift' : 'border-line bg-paper/70 shadow-card'
                  }`}
                >
                  <span className="text-2xl">{o.emoji}</span>
                  <span className="text-base font-medium text-ink">{o.label}</span>
                </button>
              );
            })}

            {/* "Other": the traveller answers in their own words. */}
            <div
              className={`rounded-lg border transition ${typing || answers[q.id] === 'other' ? 'border-ink bg-paper shadow-lift' : 'border-dashed border-line bg-paper/50'}`}
            >
              <button onClick={() => setTyping(true)} className="flex min-h-[4rem] w-full items-center gap-4 px-4 text-left" aria-expanded={typing}>
                <span className="text-2xl">✍️</span>
                <span className="text-base font-medium text-ink">{t('quiz.other')}</span>
              </button>
              {typing && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!otherText.trim()) return;
                    setAnswers((a) => ({ ...a, [q.id]: 'other' }));
                    next();
                  }}
                  className="space-y-3 px-4 pb-4"
                >
                  <textarea
                    autoFocus
                    rows={2}
                    maxLength={200}
                    value={otherText}
                    onChange={(e) => setNotes((n) => ({ ...n, [q.id]: e.target.value }))}
                    placeholder={t('quiz.otherPlaceholder')}
                    aria-label={t('quiz.other')}
                    className="w-full rounded-md border border-line bg-ivory p-3 text-base text-ink outline-none placeholder:text-muted/70 focus:border-ink"
                  />
                  <PillButton type="submit" full small disabled={!otherText.trim()}>
                    {t('quiz.continue')}
                  </PillButton>
                </form>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
