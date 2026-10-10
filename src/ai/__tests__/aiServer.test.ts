import { describe, expect, it } from 'vitest';
import { handleAi, keepsNumbers } from '../../../api/_ai';

describe('AI number guard', () => {
  it('accepts a rewrite that keeps every number', () => {
    expect(keepsNumbers('Lowest true cost at ₹15,125. Lands 08:35.', 'The cheapest overall, ₹15,125, landing at 08:35.')).toBe(true);
  });
  it('rejects a rewrite that changes or drops a number', () => {
    expect(keepsNumbers('Costs ₹15,125 in all.', 'Costs about ₹15,000 in all.')).toBe(false);
    expect(keepsNumbers('Only 2 seats left.', 'Only a few seats left.')).toBe(false);
  });
});

describe('AI handler', () => {
  it('rejects unknown tasks and oversized input before calling anyone', async () => {
    expect((await handleAi({ task: 'chat', items: [] }, { GROQ_API_KEY: 'x' })).status).toBe(400);
    const big = { task: 'reword', items: Array.from({ length: 9 }, (_, i) => ({ id: `o${i}`, text: 'x' })) };
    expect((await handleAi(big, { GROQ_API_KEY: 'x' })).status).toBe(400);
  });
  it('says when no key is configured, so the app uses its own wording', async () => {
    const out = await handleAi({ task: 'reword', items: [{ id: 'o1', text: 'Free.' }] }, {});
    expect(out).toEqual({ status: 503, json: { error: 'not-configured' } });
  });
});
