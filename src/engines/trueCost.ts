import type { Expense } from '../types';

export const costCategories: { key: Expense['category']; label: string }[] = [
  { key: 'tickets', label: 'Tickets' },
  { key: 'stay', label: 'Stay' },
  { key: 'transport', label: 'Getting around' },
  { key: 'food', label: 'Food' },
  { key: 'fees', label: 'Fees & hidden costs' },
  { key: 'other', label: 'Other' },
];

/** True journey cost: everything the trip costs, not only the ticket. */
export function trueCost(expenses: Expense[]) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = costCategories
    .map((c) => {
      const amount = expenses.filter((e) => e.category === c.key).reduce((s, e) => s + e.amount, 0);
      return { ...c, amount, share: total ? amount / total : 0 };
    })
    .filter((c) => c.amount > 0);
  const ticket = byCategory.find((c) => c.key === 'tickets')?.amount ?? 0;
  return { total, ticket, hidden: total - ticket, byCategory };
}
