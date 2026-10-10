import { describe, expect, it } from 'vitest';
import { redeemFor } from '../loyalty';
import { offersLink } from '../../data/cardOffers';

describe('using points', () => {
  it('caps points at 20% of the booking and the balance', () => {
    expect(redeemFor(5000, 10_000)).toEqual({ points: 2000, savesInr: 2000, payInr: 8000 });
    expect(redeemFor(300, 10_000)).toEqual({ points: 300, savesInr: 300, payInr: 9700 });
    expect(redeemFor(0, 10_000).payInr).toBe(10_000);
  });
});

describe('card offers', () => {
  it('links to the bank page, or searches when there is none', () => {
    expect(offersLink({ id: '1', bankId: 'icici', network: 'Visa', kind: 'credit', label: '' }, 'flight')).toBe('https://www.icicibank.com/offers');
    expect(offersLink({ id: '2', bankId: 'hdfc', network: 'Visa', kind: 'credit', label: '' }, 'hotel')).toContain('google.com/search?q=HDFC%20Bank%20credit%20card%20hotel%20offers');
  });
});
