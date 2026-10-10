import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, SlidersHorizontal } from 'lucide-react';
import { writeAndQueue } from '../../db/syncQueue';
import { budgetPlan, CATEGORY_LABEL, DEFAULT_SPLIT, normaliseSplit, trackSpending, tripDays, type BudgetCategory, type BudgetSplit, type Spend } from '../../engines/budget';
import { inr } from '../../utils/format';
import { pastelBg, type Pastel } from '../../design/tokens';
import type { Booking, Expense, Trip } from '../../types';

const CATS: BudgetCategory[] = ['travel', 'stay', 'food', 'local', 'activities', 'buffer'];
const PASTEL: Record<BudgetCategory, Pastel> = { travel: 'sky', stay: 'peach', food: 'rose', local: 'butter', activities: 'mint', buffer: 'lavender' };

/** Expense categories as stored on the phone, mapped to budget categories. */
const FROM_EXPENSE: Record<Expense['category'], BudgetCategory> = { tickets: 'travel', stay: 'stay', transport: 'local', food: 'food', fees: 'buffer', other: 'activities' };
const TO_EXPENSE: Record<BudgetCategory, Expense['category']> = { travel: 'tickets', stay: 'stay', local: 'transport', food: 'food', buffer: 'fees', activities: 'other' };

/** Adjustable split of the trip budget into categories, with daily allowances. */
export function SplitEditor({ trip }: { trip: Trip }) {
  const [split, setSplit] = useState<BudgetSplit>(() => normaliseSplit(trip.budgetSplit ?? DEFAULT_SPLIT));
  const [open, setOpen] = useState(false);
  const days = tripDays(trip.startDate, trip.endDate);
  const plan = budgetPlan(trip.budgetInr ?? 0, split, days, trip.travellers);

  const save = (next: BudgetSplit) => {
    setSplit(next);
    void writeAndQueue('trips', trip.id, { ...trip, budgetSplit: next }, `Budget split: ${trip.title}`);
  };

  if (!trip.budgetInr) return <p className="mb-6 rounded-md border border-line bg-butter px-4 py-3 text-sm text-ink">Add a total budget to this trip (edit it from New Trip) to get a budget split and daily allowances.</p>;

  return (
    <div className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Budget split of {inr(trip.budgetInr)}</p>
        <button onClick={() => setOpen(!open)} className="flex min-h-tap items-center gap-1 text-sm font-medium text-ink underline underline-offset-4">
          <SlidersHorizontal size={14} /> {open ? 'Done' : 'Adjust'}
        </button>
      </div>
      <div className="mt-2 flex h-4 overflow-hidden rounded-pill border border-line">
        {CATS.map((c) => (
          <span key={c} className={pastelBg[PASTEL[c]]} style={{ width: `${split[c] * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {CATS.map((c) => (
          <li key={c}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-espresso">
                <span className={`h-3 w-3 rounded-full border border-ink/10 ${pastelBg[PASTEL[c]]}`} />
                {CATEGORY_LABEL[c]}
              </span>
              <span className="tabular-nums text-ink">
                {inr(plan.amounts[c])} <span className="text-muted">· {Math.round(split[c] * 100)}%</span>
              </span>
            </div>
            {open && (
              <input
                type="range"
                min={0}
                max={60}
                value={Math.round(split[c] * 100)}
                onChange={(e) => save(normaliseSplit({ ...split, [c]: Number(e.target.value) / 100 }))}
                aria-label={`${CATEGORY_LABEL[c]} share`}
                className="mt-1 w-full accent-ink"
              />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-md bg-ivory px-3 py-2 text-xs text-espresso">
        Daily, per person: food {inr(plan.daily.food)} (about {inr(plan.daily.meal)} a meal), local travel {inr(plan.daily.local)}, activities {inr(plan.daily.activities)}. Places that fit
        are marked “fits your budget” in Restaurants, Experiences and Transport.
      </p>
    </div>
  );
}

/** Spent vs planned during the trip, refunds included, with an expense form. */
export function SpendTracker({ trip, expenses, bookings }: { trip: Trip; expenses: Expense[]; bookings: Booking[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('food');

  const spends: Spend[] = useMemo(
    () => [
      ...expenses.map((e) => ({ category: FROM_EXPENSE[e.category], amount: e.amount, date: e.date ?? today })),
      // Bookings paid count as spent; refunds from cancellations come back off.
      ...bookings
        .filter((b) => !b.sample && (b.status === 'confirmed' || b.status === 'cancelled'))
        .flatMap((b) => {
          const cat: BudgetCategory = b.kind === 'flight' ? 'travel' : b.kind === 'hotel' ? 'stay' : b.kind === 'transport' ? 'local' : 'activities';
          const rows: Spend[] = [{ category: cat, amount: b.amount, date: today }];
          if (b.status === 'cancelled' && b.refundInr) rows.push({ category: cat, amount: -b.refundInr, date: today });
          return rows;
        }),
    ],
    [expenses, bookings, today],
  );
  if (!trip.budgetInr) return null;
  const t = trackSpending(trip.budgetInr, trip.budgetSplit ?? DEFAULT_SPLIT, trip.startDate, trip.endDate, spends, today);

  const add = async () => {
    const value = Number(amount.replace(/[,\s₹]/g, ''));
    if (!label.trim() || !value) return;
    const e: Expense = { id: `x-${crypto.randomUUID()}`, tripId: trip.id, label: label.trim(), amount: Math.round(value), category: TO_EXPENSE[category], date: today };
    await writeAndQueue('expenses', e.id, e, `Expense: ${e.label}`);
    setLabel('');
    setAmount('');
  };

  return (
    <div className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
      <p className="text-sm text-muted">Spent so far</p>
      <p className="font-display text-[2rem] leading-none text-ink">{inr(t.totalSpent)}</p>
      <p className={`mt-1 text-sm ${t.remaining < 0 ? 'text-bad' : 'text-espresso'}`}>
        {t.remaining >= 0 ? `${inr(t.remaining)} left` : `${inr(-t.remaining)} over budget`}
        {t.daysLeft > 0 && t.remaining > 0 && ` · about ${inr(t.perDayLeft)} a day for ${t.daysLeft} days`}
      </p>
      {t.alert && (
        <p className="mt-2 flex items-start gap-2 rounded-md bg-rose px-3 py-2 text-sm text-ink" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
          {t.alert === 'over' ? 'You are over your total budget.' : `Over plan on ${t.rows.filter((r) => r.over).map((r) => CATEGORY_LABEL[r.category].toLowerCase()).join(', ')}.`}
        </p>
      )}
      <ul className="mt-3 space-y-2 text-sm">
        {t.rows
          .filter((r) => r.planned > 0 || r.spent !== 0)
          .map((r) => (
            <li key={r.category}>
              <div className="flex justify-between">
                <span className="text-espresso">{CATEGORY_LABEL[r.category]}</span>
                <span className={`tabular-nums ${r.over ? 'font-semibold text-bad' : 'text-ink'}`}>
                  {inr(r.spent)} / {inr(r.planned)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-sand">
                <span className={`block h-full ${r.over ? 'bg-bad' : pastelBg[PASTEL[r.category]]}`} style={{ width: `${Math.min(100, r.planned ? (r.spent / r.planned) * 100 : 100)}%` }} />
              </div>
            </li>
          ))}
      </ul>
      <div className="mt-4 grid grid-cols-[1fr_6rem] gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What did you spend on?" className="min-h-tap rounded-md border border-line bg-ivory px-3 text-sm outline-none focus:border-ink" aria-label="Expense" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="₹" className="min-h-tap rounded-md border border-line bg-ivory px-3 text-sm outline-none focus:border-ink" aria-label="Amount" />
        <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)} className="min-h-tap rounded-md border border-line bg-ivory px-2 text-sm" aria-label="Category">
          {CATS.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <button onClick={() => void add()} className="flex min-h-tap items-center justify-center gap-1 rounded-pill bg-ink text-sm font-medium text-ivory">
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}
