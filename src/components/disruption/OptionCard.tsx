import { useState } from 'react';
import { ChevronDown, Clock, IndianRupee } from 'lucide-react';
import type { CostKind, OptionTag, RankedOption } from '../../engines/ranking';
import { span } from '../../engines/time';
import { inr } from '../../utils/format';
import { Chip } from '../ui/Chip';

const tagChip: Record<OptionTag, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  cheapest: { label: 'Cheapest', tone: 'ok' },
  fastest: { label: 'Fastest', tone: 'ok' },
  'few-seats': { label: 'Few seats', tone: 'warn' },
  risky: { label: 'Risky', tone: 'bad' },
  'loses-day': { label: 'Loses a day', tone: 'warn' },
};

const kindLabel: Record<CostKind, string> = { new: 'You pay', lost: 'Prepaid, lost', estimate: 'Estimate' };

/** One ranked recovery option: true cost, time lost, a one-line reason, and the cost breakdown. */
export function OptionCard({ option, why, selected, soldOut, onSelect }: {
  option: RankedOption;
  why: string;
  selected: boolean;
  soldOut?: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { rank, candidate, total, timeLostMin, tags, lines } = option;

  return (
    <div
      className={`rounded-lg border transition ${soldOut ? 'border-line bg-sand/50 opacity-70' : selected ? 'border-ink bg-paper shadow-lift ring-1 ring-ink' : 'border-line bg-paper/70 shadow-card'}`}
    >
      <button type="button" onClick={onSelect} disabled={soldOut} aria-pressed={selected} className="w-full p-4 text-left">
        <div className="flex items-start gap-3">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-dashed font-display text-base ${
              rank === 1 ? 'border-ok bg-mint text-ink' : 'border-line text-espresso'
            }`}
          >
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            {rank === 1 && !soldOut && <p className="mb-0.5 text-[0.625rem] font-bold uppercase tracking-widest text-ok">Best for you</p>}
            <p className="font-display text-lg leading-snug text-ink">{candidate.title}</p>
            <p className="text-xs text-muted">{candidate.provider}</p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1 text-ink">
                <IndianRupee size={14} />
                <span className="font-semibold">{total ? inr(total).replace('₹', '') : 'Free'}</span>
                <span className="text-muted">true cost</span>
              </span>
              <span className="flex items-center gap-1 text-ink">
                <Clock size={14} />
                <span className="font-semibold">{timeLostMin ? span(timeLostMin) : 'No delay'}</span>
                {timeLostMin > 0 && <span className="text-muted">lost</span>}
              </span>
            </div>

            {(tags.length > 0 || soldOut) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {soldOut && (
                  <Chip tone="bad" dot>
                    Sold out
                  </Chip>
                )}
                {tags.map((t) => (
                  <Chip key={t} tone={tagChip[t].tone} dot>
                    {tagChip[t].label}
                  </Chip>
                ))}
              </div>
            )}
            <p className="mt-2 text-sm leading-relaxed text-espresso">{why}</p>
          </div>
        </div>
      </button>

      {lines.length > 0 && (
        <div className="border-t border-dashed border-line px-4 pb-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-h-[2.75rem] w-full items-center justify-between text-sm font-medium text-espresso"
          >
            What's in the true cost
            <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <ul className="space-y-1.5 pb-1">
              {lines.map((l) => (
                <li key={l.label} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="text-ink">{l.label}</span>
                    <span className="block text-[0.625rem] font-semibold uppercase tracking-widest text-muted">{kindLabel[l.kind]}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">{inr(l.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-line pt-1.5 text-sm font-semibold text-ink">
                <span>True cost</span>
                <span className="tabular-nums">{inr(total)}</span>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
