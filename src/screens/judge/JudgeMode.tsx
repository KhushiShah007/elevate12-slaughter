import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RotateCcw, Zap } from 'lucide-react';
import { judgeScenarios } from '../../data/judgeScenarios';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';

/** Hidden demo panel (long-press the logo). Fires sample disasters for judges. */
export default function JudgeMode() {
  const navigate = useNavigate();

  return (
    <div className="px-gutter pb-12 pt-3">
      <div className="flex min-h-tap items-center justify-between">
        <button onClick={() => navigate(-1)} className="-ml-3 flex min-h-tap items-center pl-1.5 pr-3 text-sm font-medium text-espresso">
          <ChevronLeft size={20} /> Back
        </button>
        <Chip tone="bad" dot>
          Judge Mode
        </Chip>
      </div>

      <h1 className="mt-6 text-[2.25rem] leading-[1.1]">Break something</h1>
      <p className="mt-2 text-sm text-espresso">Each button fires a sample disaster on the Kyoto & Tokyo trip.</p>

      <div className="mt-8 space-y-3">
        {judgeScenarios.map((s, i) => (
          <button
            key={s.type}
            onClick={() => navigate(`/trips/t-japan/disruption/${s.type}`)}
            className="flex min-h-[4.5rem] w-full items-center gap-4 rounded-lg border border-bad/30 bg-rose px-4 text-left shadow-card active:scale-[0.98]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-bad font-display text-lg text-paper">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg leading-tight text-ink">{s.title}</span>
              <span className="block text-sm text-espresso">{s.detail}</span>
            </span>
            <Zap size={20} className="shrink-0 text-bad" />
          </button>
        ))}
      </div>

      <PillButton full variant="ghost" className="mt-8" icon={<RotateCcw size={18} />} onClick={() => navigate('/home')}>
        Reset demo
      </PillButton>
    </div>
  );
}
