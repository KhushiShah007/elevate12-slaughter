import { Minus, Plus } from 'lucide-react';
import type { FlightStatus } from '../../types';
import { span } from '../../engines/time';
import { Chip } from '../ui/Chip';

const sourceLabel: Record<FlightStatus['source'], string> = {
  sample: 'Sample schedule',
  reported: 'Reported by you',
  simulated: 'Simulated in Judge Mode',
};

/** "How late is it?" Change the minutes and the whole cascade below recomputes. */
export function StatusControl({ question, flightNo, minutes, source, presets, onChange, onClear }: {
  question: string;
  flightNo: string;
  minutes: number;
  source: FlightStatus['source'];
  presets: number[];
  onChange: (min: number) => void;
  onClear: () => void;
}) {
  const step = 15;
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-espresso">
          {question} <span className="font-semibold text-ink">{flightNo}</span>
        </p>
        <Chip tone={source === 'sample' ? 'neutral' : 'warn'} dot>
          {sourceLabel[source]}
        </Chip>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => onChange(Math.max(0, minutes - step))}
          disabled={minutes === 0}
          aria-label={`${step} minutes less`}
          className="grid h-tap w-tap place-items-center rounded-full border border-line bg-ivory text-ink disabled:opacity-40"
        >
          <Minus size={20} />
        </button>
        <p className="font-display text-[2.5rem] leading-none tabular-nums text-ink" aria-live="polite">
          {minutes ? span(minutes) : 'On time'}
        </p>
        <button
          onClick={() => onChange(minutes + step)}
          aria-label={`${step} minutes more`}
          className="grid h-tap w-tap place-items-center rounded-full bg-ink text-ivory"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-h-[2.5rem] rounded-pill border px-4 text-sm ${p === minutes ? 'border-ink bg-ink text-ivory' : 'border-line bg-ivory text-ink'}`}
          >
            {span(p)}
          </button>
        ))}
        {minutes > 0 && (
          <button onClick={onClear} className="min-h-[2.5rem] px-2 text-sm text-espresso underline underline-offset-4">
            Back on time
          </button>
        )}
      </div>
    </div>
  );
}
