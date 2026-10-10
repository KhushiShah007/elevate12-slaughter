import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { quizQuestions } from '../../data/quizQuestions';
import { savePreferences } from '../../db/repos/users';
import { PillButton } from '../../components/ui/PillButton';
import { StampCard } from '../../components/cards/StampCard';
import { StampThump } from '../../components/motion/StampThump';
import type { TravellerPreferences } from '../../types';

type Answers = Partial<Record<keyof TravellerPreferences, string>>;

export default function PersonaQuiz() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const done = i >= quizQuestions.length;
  const q = quizQuestions[i];

  const pick = (value: string) => {
    setAnswers((a) => ({ ...a, [q.id]: value }));
    setTimeout(() => setI((n) => n + 1), 180);
  };

  if (done) {
    // Goal 6 turns answers into a real persona. For now we show the sample result.
    return (
      <div className="flex min-h-screen flex-col items-center px-gutter pb-8 pt-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Your travel persona</p>
        <div className="relative mt-8">
          <StampCard pastel="mint" tilt={-3} className="w-56">
            <span className="text-5xl">☕</span>
            <p className="mt-3 font-display text-2xl leading-tight text-ink">The Slow Explorer</p>
            <p className="mt-1 text-xs text-espresso">Two good things a day, never rushed</p>
          </StampCard>
          <div className="absolute -bottom-6 -right-8">
            <StampThump label="Approved" tone="ok" />
          </div>
        </div>
        <p className="mt-12 max-w-xs text-sm leading-relaxed text-espresso">
          We will suggest calmer days, vegetarian places and more buffer before flights. You can retake this any time from Me.
        </p>
        <div className="mt-auto w-full pt-8">
          <PillButton
            full
            onClick={async () => {
              await savePreferences(answers);
              navigate('/home');
            }}
          >
            Start exploring
          </PillButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-gutter pb-8 pt-3">
      <div className="flex min-h-tap items-center justify-between">
        <button
          onClick={() => (i === 0 ? navigate(-1) : setI(i - 1))}
          className="-ml-3 flex min-h-tap items-center pl-1.5 pr-3 text-sm font-medium text-espresso"
        >
          <ChevronLeft size={20} /> Back
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
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
