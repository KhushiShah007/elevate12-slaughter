import { Sparkles } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { trueCost } from '../../engines/trueCost';
import { loyaltySummary } from '../../engines/loyalty';
import { inr, num } from '../../utils/format';
import type { Pastel } from '../../design/tokens';
import { pastelBg } from '../../design/tokens';
import { PayHelp } from '../../components/guide/PayHelp';
import { useGuide } from '../../hooks/useGuide';
import { budgetStyleLabel } from '../../engines/personalize';
import type { Booking, Trip } from '../../types';

/** Plan vs budget for a trip: cheapest saved flight and stay, plus typical daily spend. */
function PlanVsBudget({ trip, bookings }: { trip: Trip; bookings: Booking[] }) {
  const { guide, style } = useGuide(trip);
  const days = Math.max(1, Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000) + 1);
  const cheapest = (kind: Booking['kind']) => {
    const booked = bookings.filter((b) => b.kind === kind && b.status === 'confirmed' && !b.sample);
    if (booked.length) return { amount: booked.reduce((s, b) => s + b.amount, 0), booked: true };
    const saved = bookings.filter((b) => b.kind === kind && b.status === 'suggested');
    return saved.length ? { amount: Math.min(...saved.map((b) => b.amount)), booked: false } : null;
  };
  const flight = cheapest('flight');
  const stay = cheapest('hotel');
  // Daily spend covers food and local travel; the stay is counted separately when there is one.
  const daily = guide?.destination.dailyCostInr ? Math.round(guide.destination.dailyCostInr[style] * (stay ? 0.55 : 1)) * days * trip.travellers : null;
  const rows: [string, number | null, string][] = [
    ['Flights', flight?.amount ?? null, flight ? (flight.booked ? 'booked' : 'cheapest saved option') : 'none saved yet'],
    ['Stay', stay?.amount ?? null, stay ? (stay.booked ? 'booked' : 'cheapest saved option') : 'none saved yet'],
    [stay ? 'Food & local travel' : 'Daily spend', daily, `${budgetStyleLabel[style].toLowerCase()} style, ${days} days × ${trip.travellers}, estimate`],
  ];
  const total = rows.reduce((s, [, v]) => s + (v ?? 0), 0);
  const left = trip.budgetInr != null ? trip.budgetInr - total : null;
  return (
    <div className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
      <p className="text-sm text-muted">Planned so far</p>
      <p className="font-display text-[2.25rem] leading-none text-ink">{inr(total)}</p>
      {left != null && (
        <p className={`mt-1 text-sm font-medium ${left >= 0 ? 'text-ok' : 'text-bad'}`}>
          {left >= 0 ? `${inr(left)} under your ${inr(trip.budgetInr!)} budget` : `${inr(-left)} over your ${inr(trip.budgetInr!)} budget`}
        </p>
      )}
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map(([label, v, note]) => (
          <li key={label} className="flex items-start justify-between gap-3">
            <span className="text-espresso">
              {label}
              <span className="block text-xs text-muted">{note}</span>
            </span>
            <span className="tabular-nums text-ink">{v != null ? inr(v) : '—'}</span>
          </li>
        ))}
      </ul>
      {(flight || stay) && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-ink">Pay less on flights and stay ({inr((flight?.amount ?? 0) + (stay?.amount ?? 0))}):</p>
          <PayHelp amount={(flight?.amount ?? 0) + (stay?.amount ?? 0)} kind="travel" />
        </div>
      )}
    </div>
  );
}

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
      {({ trip, expenses, bookings }) => {
        const cost = trueCost(expenses);
        const points = loyaltySummary(bookings);
        if (!trip.sample && expenses.length === 0) return <PlanVsBudget trip={trip} bookings={bookings} />;
        return (
          <>
            {!trip.sample && <PlanVsBudget trip={trip} bookings={bookings} />}
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
