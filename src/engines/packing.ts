import type { Persona } from './persona';

// A packing checklist from the trip: weather, length, travellers, abroad or not, persona.
// Plain rules; the traveller can tick, add and remove items.

export const PACK_CATEGORIES = ['Documents', 'Clothes', 'Footwear', 'Toiletries', 'Medicines', 'Electronics', 'Accessories', 'Weather gear', 'Misc'] as const;
export type PackCategory = (typeof PACK_CATEGORIES)[number];

export interface PackItem {
  id: string;
  category: PackCategory;
  label: string;
  checked: boolean;
  custom?: boolean;
}

export interface PackingInput {
  days: number;
  travellers: number;
  international: boolean;
  weather: { maxC: number | null; minC: number | null; rainy: boolean } | null;
  persona: Persona;
}

export function generatePacking(i: PackingInput): PackItem[] {
  const out: PackItem[] = [];
  const add = (category: PackCategory, label: string) => out.push({ id: `${category}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), category, label, checked: false });
  const nights = Math.max(1, i.days - 1);
  const changes = Math.min(nights + 1, 7); // laundry after a week

  add('Documents', 'ID card (Aadhaar, PAN or driving licence)');
  add('Documents', 'Tickets and hotel confirmations (in Voyage)');
  if (i.international) {
    add('Documents', 'Passport (valid 6+ months)');
    add('Documents', 'Visa / e-visa printout');
    add('Documents', 'Travel insurance');
    add('Misc', 'Some local currency or a forex card');
    add('Electronics', 'Plug adapter');
  }
  add('Clothes', `${changes} sets of day clothes`);
  add('Clothes', `${changes} sets of underwear and socks`);
  add('Clothes', 'Sleepwear');
  add('Footwear', 'Comfortable walking shoes');
  add('Footwear', 'Sandals or slippers');
  add('Toiletries', 'Toothbrush and toothpaste');
  add('Toiletries', 'Soap, shampoo, deodorant');
  add('Toiletries', 'Sunscreen');
  add('Medicines', 'Your regular medicines');
  add('Medicines', 'Basic first aid: plasters, paracetamol, ORS');
  add('Electronics', 'Phone charger and power bank');
  add('Accessories', 'Reusable water bottle');
  add('Accessories', 'Sunglasses');

  const w = i.weather;
  if (w?.rainy) {
    add('Weather gear', 'Umbrella or rain jacket');
    add('Footwear', 'Quick-dry footwear');
  }
  if (w?.minC != null && w.minC < 15) {
    add('Weather gear', w.minC < 5 ? 'Warm jacket, thermals, gloves and cap' : 'Light jacket or sweater');
  }
  if (w?.maxC != null && w.maxC >= 30) {
    add('Weather gear', 'Hat or cap');
    add('Clothes', 'Light cotton clothes');
  }

  if (i.persona.id === 'family' || i.travellers > 2) {
    add('Medicines', 'Medicines for children or elders travelling with you');
    add('Misc', 'Snacks for the journey');
  }
  if (i.persona.vegFirst) add('Misc', i.persona.jain ? 'Jain-friendly snacks' : 'Vegetarian snacks for travel days');
  if (i.persona.interests.includes('nature')) add('Footwear', 'Trekking shoes');
  if (i.persona.interests.includes('culture')) add('Clothes', 'Modest clothes for temples (shoulders and knees covered)');
  return out;
}

/** Merge a regenerated list with the saved one: keep ticks and custom items. */
export function mergePacking(saved: PackItem[], fresh: PackItem[]): PackItem[] {
  const byId = new Map(saved.map((s) => [s.id, s]));
  const merged = fresh.map((f) => (byId.has(f.id) ? { ...f, checked: byId.get(f.id)!.checked } : f));
  return [...merged, ...saved.filter((s) => s.custom)];
}
