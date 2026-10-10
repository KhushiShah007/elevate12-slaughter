import { budgetPlan, DEFAULT_SPLIT, tripDays, type BudgetSplit } from '../engines/budget';
import type { BudgetStyle } from '../engines/personalize';
import type { Guide } from './useGuide';
import type { Trip } from '../types';

export interface Allowance {
  /** Where the numbers come from: the trip's own budget, or the budget style. */
  source: 'budget' | 'style';
  food: number; // per person per day
  meal: number; // per person per meal
  local: number; // per person per day
  activities: number; // per person per day
  stayPerNight: number; // per room
}

/** Daily allowances for a trip, used to badge places "fits your budget". */
export function allowanceFor(trip: Trip, guide: Guide | null | undefined, style: BudgetStyle): Allowance | null {
  const days = tripDays(trip.startDate, trip.endDate);
  if (trip.budgetInr) {
    const d = budgetPlan(trip.budgetInr, (trip.budgetSplit as Partial<BudgetSplit> | undefined) ?? DEFAULT_SPLIT, days, trip.travellers).daily;
    return { source: 'budget', ...d };
  }
  const c = guide?.destination.dailyCostInr?.[style];
  if (!c) return null;
  // Same shares as the server's cost index (stay 45%, food 30%, local 12%, activities 13%).
  return { source: 'style', food: Math.round(c * 0.3), meal: Math.round(c * 0.15), local: Math.round(c * 0.12), activities: Math.round(c * 0.13), stayPerNight: Math.round(c * 0.45 * 2) };
}

/** Where to measure distances from: the saved or booked stay, if it has coordinates. */
export function stayOrigin(bookings: { kind: string; status: string; title: string; details?: { lat?: number | null; lon?: number | null } }[]) {
  const stay = bookings.find((b) => b.kind === 'hotel' && b.status !== 'cancelled' && b.details?.lat != null && b.details?.lon != null);
  return stay ? { lat: stay.details!.lat!, lon: stay.details!.lon!, label: stay.title } : null;
}
