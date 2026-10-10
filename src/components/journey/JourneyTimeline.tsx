import { Check } from 'lucide-react';
import type { JourneyStep } from '../../types';
import { PillButton } from '../ui/PillButton';
import { StampThump } from '../motion/StampThump';
import { useT } from '../../i18n';

/** Vertical airport timeline. Each step is confirmed by hand: we cannot sense it. */
export function JourneyTimeline({ steps, done, onDone }: {
  steps: JourneyStep[];
  done: Set<string>;
  onDone: (id: string) => void;
}) {
  const current = steps.find((s) => !done.has(s.id))?.id;
  const { t } = useT();

  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const isDone = done.has(s.id);
        const isCurrent = s.id === current;
        return (
          <li key={s.id} className="relative flex gap-4 pb-5 last:pb-0">
            {i < steps.length - 1 && (
              <span className={`absolute left-[1.0625rem] top-10 h-[calc(100%-2.5rem)] border-l-2 ${isDone ? 'border-ok' : 'border-dashed border-line'}`} />
            )}
            <span
              className={`z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 ${
                isDone ? 'border-ok bg-ok text-paper' : isCurrent ? 'border-ink bg-paper text-ink' : 'border-line bg-paper text-muted'
              }`}
            >
              {isDone ? <Check size={18} strokeWidth={3} /> : <span className="text-xs font-semibold">{i + 1}</span>}
            </span>
            <div
              className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md border p-3 ${
                isCurrent ? 'border-ink/20 bg-paper shadow-card' : 'border-transparent'
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold tabular-nums text-muted">{s.at}</p>
                <p className={`font-display text-lg leading-tight ${isDone ? 'text-muted line-through decoration-1' : 'text-ink'}`}>{s.label}</p>
                <p className="truncate text-xs text-muted">{s.hint}</p>
              </div>
              {isDone ? (
                <StampThump label={t('active.done')} size="sm" />
              ) : isCurrent ? (
                <PillButton small onClick={() => onDone(s.id)}>
                  {t('active.done')}
                </PillButton>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
