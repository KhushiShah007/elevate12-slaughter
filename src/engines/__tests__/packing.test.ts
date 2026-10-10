import { describe, expect, it } from 'vitest';
import { derivePersona } from '../persona';
import { generatePacking, mergePacking } from '../packing';

const base = { days: 5, travellers: 2, international: false, weather: null, persona: derivePersona({}) };
const labels = (x: ReturnType<typeof generatePacking>) => x.map((i) => i.label);

describe('packing list', () => {
  it('covers the basics, sized to the trip', () => {
    const l = labels(generatePacking(base));
    expect(l).toContain('5 sets of day clothes');
    expect(l).not.toContain('Passport (valid 6+ months)');
  });

  it('adds documents for abroad and gear for the weather', () => {
    const l = labels(generatePacking({ ...base, international: true, weather: { maxC: 8, minC: 2, rainy: true } }));
    expect(l).toEqual(expect.arrayContaining(['Passport (valid 6+ months)', 'Plug adapter', 'Umbrella or rain jacket', 'Warm jacket, thermals, gloves and cap']));
  });

  it('follows the persona', () => {
    const l = labels(generatePacking({ ...base, persona: derivePersona({ mix: 'family', food: 'jain', interests: 'culture' }) }));
    expect(l).toEqual(expect.arrayContaining(['Medicines for children or elders travelling with you', 'Jain-friendly snacks', 'Modest clothes for temples (shoulders and knees covered)']));
  });

  it('keeps ticks and custom items when the list is refreshed', () => {
    const first = generatePacking(base).map((i, n) => (n === 0 ? { ...i, checked: true } : i));
    const merged = mergePacking([...first, { id: 'c1', category: 'Misc' as const, label: 'Camera', checked: false, custom: true }], generatePacking({ ...base, weather: { maxC: 32, minC: 24, rainy: true } }));
    expect(merged[0].checked).toBe(true);
    expect(merged.some((i) => i.label === 'Camera')).toBe(true);
    expect(merged.some((i) => i.label === 'Umbrella or rain jacket')).toBe(true);
  });
});
