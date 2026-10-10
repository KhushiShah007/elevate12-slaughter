// Budget-first engine, shared by the app and the server (pure functions).
// A trip has a total budget split into categories; the split gives daily budgets that
// Experiences, Restaurants, Transportation and the Itinerary use to filter and badge.

export type BudgetCategory = 'travel' | 'stay' | 'food' | 'local' | 'activities' | 'buffer';
export type BudgetSplit = Record<BudgetCategory, number>; // shares that add up to 1

/** Spec default: 35% travel, 30% stay, 20% food, 10% local transport, 5% buffer. Activities come out of the buffer unless given a share. */
export const DEFAULT_SPLIT: BudgetSplit = { travel: 0.35, stay: 0.3, food: 0.2, local: 0.1, activities: 0, buffer: 0.05 };

export const CATEGORY_LABEL: Record<BudgetCategory, string> = {
  travel: 'Travel to and from',
  stay: 'Stay',
  food: 'Food',
  local: 'Local transport',
  activities: 'Activities',
  buffer: 'Buffer',
};

/** Shares rescaled to add up to exactly 1 (so sliders can be moved freely). */
export function normaliseSplit(split: Partial<BudgetSplit>): BudgetSplit {
  const s = { ...DEFAULT_SPLIT, ...split };
  const sum = Object.values(s).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.max(0, v) / sum])) as BudgetSplit;
}

export const tripDays = (start: string, end: string) => Math.max(1, Math.round((Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) / 86_400_000) + 1);

/** What each category may cost in total, and per day per person for the on-trip ones. */
export function budgetPlan(total: number, split: Partial<BudgetSplit>, days: number, travellers: number) {
  const s = normaliseSplit(split);
  const amounts = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(total * v)])) as Record<BudgetCategory, number>;
  const perDayPerPerson = (k: BudgetCategory) => Math.round(amounts[k] / Math.max(1, days) / Math.max(1, travellers));
  return {
    split: s,
    amounts,
    daily: {
      food: perDayPerPerson('food'),
      /** One meal: a day has about two paid meals. */
      meal: Math.round(perDayPerPerson('food') / 2),
      local: perDayPerPerson('local'),
      // Activities have their own share if set, else they come out of the buffer.
      activities: perDayPerPerson(s.activities > 0 ? 'activities' : 'buffer'),
      stayPerNight: Math.round(amounts.stay / Math.max(1, days - 1 || 1)),
    },
  };
}

export type Fit = 'within' | 'tight' | 'over';
/** Within budget, tight (up to 10% over), or over. */
export const fitFor = (cost: number, budget: number): Fit => (cost <= budget ? 'within' : cost <= budget * 1.1 ? 'tight' : 'over');

export const FIT_LABEL: Record<Fit, string> = { within: 'Within budget', tight: 'Tight', over: 'Over budget' };

/** "Fits your budget" for one priced thing against a per-person allowance. */
export const fitsAllowance = (price: number | null | undefined, allowance: number) => price != null && price <= allowance;

// ---------- Spending during the trip ----------

export interface Spend {
  category: BudgetCategory;
  amount: number; // positive = spent, negative = refund
  date: string; // yyyy-mm-dd
}

/** Spent vs planned per category, what is left per remaining day, and overspend alerts. */
export function trackSpending(total: number, split: Partial<BudgetSplit>, start: string, end: string, spends: Spend[], today: string) {
  const plan = budgetPlan(total, split, tripDays(start, end), 1);
  const spent = Object.fromEntries(Object.keys(plan.amounts).map((k) => [k, 0])) as Record<BudgetCategory, number>;
  for (const s of spends) spent[s.category] += s.amount;
  const totalSpent = Object.values(spent).reduce((a, b) => a + b, 0);
  const daysLeft = today > end.slice(0, 10) ? 0 : tripDays(today < start.slice(0, 10) ? start : today, end);
  const remaining = total - totalSpent;
  const rows = (Object.keys(plan.amounts) as BudgetCategory[]).map((k) => ({
    category: k,
    planned: plan.amounts[k],
    spent: spent[k],
    over: spent[k] > plan.amounts[k] && plan.amounts[k] > 0,
  }));
  return {
    rows,
    totalSpent,
    remaining,
    perDayLeft: daysLeft ? Math.floor(remaining / daysLeft) : remaining,
    daysLeft,
    alert: remaining < 0 ? ('over' as const) : rows.some((r) => r.over) ? ('category' as const) : null,
  };
}
