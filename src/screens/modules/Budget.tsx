import { Sparkles } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { trueCost } from '../../engines/trueCost';
import { loyaltySummary } from '../../engines/loyalty';
import { inr, num } from '../../utils/format';
import type { Pastel } from '../../design/tokens';
import { pastelBg } from '../../design/tokens';

const barPastel: Record<string, Pastel> = {
  tickets: 'sky',
  stay: 'peach',
  transport: 'butter',
  food: 'rose',
  fees: 'lavender',
  other: 'mint',
};

export default function Budget() {
  return (
    <ModuleFrame module="budget" title="Budget" sub="The true journey cost, not only the ticket.">
      {({ expenses, bookings }) => {
        const cost = trueCost(expenses);
        const points = loyaltySummary(bookings);
        return (
          <>
            <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
              <p className="text-sm text-muted">True journey cost</p>
              <p className="font-display text-[2.75rem] leading-none text-ink">{inr(cost.total)}</p>
              <p className="mt-2 text-sm text-espresso">
                Tickets are {inr(cost.ticket)}. The other <span className="font-semibold text-ink">{inr(cost.hidden)}</span> is what people forget.
              </p>

              <div className="mt-5 flex h-4 overflow-hidden rounded-pill border border-line">
                {cost.byCategory.map((c) => (
                  <span key={c.key} className={pastelBg[barPastel[c.key]]} style={{ width: `${c.share * 100}%` }} />
                ))}
              </div>

              <ul className="mt-4 space-y-2">
                {cost.byCategory.map((c) => (
                  <li key={c.key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-espresso">
                      <span className={`h-3 w-3 rounded-full border border-ink/10 ${pastelBg[barPastel[c.key]]}`} />
                      {c.label}
                    </span>
                    <span className="tabular-nums text-ink">
                      {inr(c.amount)} <span className="text-muted">· {Math.round(c.share * 100)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-butter p-4">
              <Sparkles size={20} className="shrink-0 text-ink" />
              <p className="text-sm text-espresso">
                This trip earned <span className="font-semibold text-ink">{num(points.total)} points</span> on {inr(points.spend)} booked in Voyage.
              </p>
            </div>

            <h2 className="mb-3 mt-6 text-xl">Expenses</h2>
            <ul className="divide-y divide-line rounded-md border border-line bg-paper">
              {expenses.map((e) => (
                <li key={e.id} className="flex justify-between px-4 py-3 text-sm">
                  <span className="text-espresso">{e.label}</span>
                  <span className="font-medium tabular-nums text-ink">{inr(e.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        );
      }}
    </ModuleFrame>
  );
}
