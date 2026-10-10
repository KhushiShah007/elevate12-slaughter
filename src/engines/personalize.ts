import { destinationFit, type Persona } from './persona';

// One set of rules that turns the traveller's persona into choices across the app:
// which destinations to suggest, which places come first, what budget to expect.
// Pure functions, so they work offline and are easy to test.

export type BudgetStyle = 'shoestring' | 'moderate' | 'comfort' | 'luxury';
type DailyCost = Record<BudgetStyle, number>;

/** The cost band that matches how the traveller likes to spend. */
export function budgetStyle(persona: Persona): BudgetStyle {
  const b = persona.resolved.budget;
  return b === 'saver' ? 'shoestring' : b === 'treat' ? 'luxury' : b === 'mid' ? 'comfort' : 'moderate';
}

export const budgetStyleLabel: Record<BudgetStyle, string> = {
  shoestring: 'Shoestring',
  moderate: 'Moderate',
  comfort: 'Comfort',
  luxury: 'Luxury',
};

/** Rough trip cost for everyone: daily cost per person × days × travellers, rounded. */
export function tripEstimate(cost: DailyCost, style: BudgetStyle, days: number, travellers: number) {
  const total = cost[style] * Math.max(1, days) * Math.max(1, travellers);
  return Math.round(total / 500) * 500;
}

// ---------- Places ----------

const CATEGORY_INTEREST: Record<string, 'culture' | 'nature' | 'family'> = {
  museum: 'culture',
  monument: 'culture',
  castle: 'culture',
  fort: 'culture',
  gallery: 'culture',
  ruins: 'culture',
  archaeological_site: 'culture',
  artwork: 'culture',
  viewpoint: 'nature',
  park: 'nature',
  garden: 'nature',
  beach: 'nature',
  nature_reserve: 'nature',
  zoo: 'family',
  theme_park: 'family',
  aquarium: 'family',
};

/** Why a place suits the traveller, or null if it is not a particular match. */
export function placeReason(category: string | null | undefined, persona: Persona): string | null {
  const kind = category ? CATEGORY_INTEREST[category] : undefined;
  if (!kind) return null;
  if (kind === 'family') return persona.id === 'family' ? 'Good with kids and elders' : null;
  if (kind === 'culture' && (persona.interests.includes('culture') || persona.id === 'culture' || persona.id === 'planner')) return 'History and culture';
  if (kind === 'nature' && (persona.interests.includes('nature') || persona.id === 'nature' || persona.id === 'slow')) return 'Views and open air';
  if (kind === 'nature' && persona.id === 'family') return 'Easy outing';
  return null;
}

/** Places that suit the persona first (stable otherwise), each with its reason. */
export function orderPlaces<T extends { category?: string | null }>(items: T[], persona: Persona) {
  return items
    .map((item, index) => ({ item, index, reason: placeReason(item.category, persona) }))
    .sort((a, b) => Number(Boolean(b.reason)) - Number(Boolean(a.reason)) || a.index - b.index)
    .map(({ item, reason }) => ({ item, reason }));
}

/** Vegetarian places first for veg and Jain travellers. */
export function orderEateries<T extends { vegetarian?: boolean | null }>(items: T[], persona: Persona) {
  if (!persona.vegFirst) return items;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Number(Boolean(b.item.vegetarian)) - Number(Boolean(a.item.vegetarian)) || a.index - b.index)
    .map((x) => x.item);
}

// ---------- Destinations ----------

interface Dest {
  slug: string;
  name: string;
  isDomestic: boolean;
  personaTags: string[];
  featured: boolean;
  dailyCostInr: DailyCost | null;
}

const personaWords: Record<Persona['id'], string> = {
  family: 'Family-friendly',
  slow: 'Easy-paced',
  foodie: 'Great food',
  culture: 'History and culture',
  nature: 'Outdoors and views',
  planner: 'Lots to see',
  saver: 'Good value',
  easy: 'Relaxed and comfortable',
};

/**
 * Destinations to suggest, best first, with short reasons. Savers lean to cheaper
 * places, treat-yourself travellers are not held back by cost.
 */
export function suggestDestinations<T extends Dest>(list: T[], persona: Persona, count = 6) {
  const style = budgetStyle(persona);
  const costs = list.map((d) => d.dailyCostInr?.shoestring ?? 0).sort((a, b) => a - b);
  const median = costs[Math.floor(costs.length / 2)] ?? 0;
  return list
    .map((d, index) => {
      const fit = destinationFit(d.personaTags, persona);
      const cheap = (d.dailyCostInr?.shoestring ?? Infinity) <= median;
      const score = fit * 3 + (style === 'shoestring' && cheap ? 2 : 0) + (d.isDomestic && style === 'shoestring' ? 1 : 0) + (d.featured ? 1 : 0);
      const reasons = [fit ? personaWords[persona.id] : null, style === 'shoestring' && cheap ? 'Easy on the budget' : null].filter((r): r is string => Boolean(r));
      return { dest: d, score, index, reasons };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map(({ dest, reasons }) => ({ dest, reasons }));
}
