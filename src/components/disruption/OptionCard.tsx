import { Clock, IndianRupee } from 'lucide-react';
import type { RecoveryOption } from '../../types';
import { inr } from '../../utils/format';

/** One ranked recovery option: true cost, time lost and a one-line reason. */
export function OptionCard({ option, rank, selected, onSelect }: {
  option: RecoveryOption;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-lg border p-4 text-left transition ${
        selected ? 'border-ink bg-paper shadow-lift ring-1 ring-ink' : 'border-line bg-paper/70 shadow-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-dashed font-display text-base ${
            rank === 1 ? 'border-ok bg-mint text-ink' : 'border-line text-espresso'
          }`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          {rank === 1 && <p className="mb-0.5 text-[0.625rem] font-bold uppercase tracking-widest text-ok">Best for you</p>}
          <p className="font-display text-lg leading-snug text-ink">{option.title}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1 text-ink">
              <IndianRupee size={14} />
              <span className="font-semibold">{option.trueCost === 0 ? 'Free' : inr(option.trueCost).replace('₹', '')}</span>
              <span className="text-muted">true cost</span>
            </span>
            <span className="flex items-center gap-1 text-ink">
              <Clock size={14} />
              <span className="font-semibold">{option.timeLost === '0' ? 'No delay' : option.timeLost}</span>
              {option.timeLost !== '0' && <span className="text-muted">lost</span>}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-espresso">{option.why}</p>
        </div>
      </div>
    </button>
  );
}
