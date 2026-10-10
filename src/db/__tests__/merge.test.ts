import { describe, expect, it } from 'vitest';
import { sameMeaning } from '../merge';

describe('sync merge', () => {
  it('treats the same step done on two devices as no conflict', () => {
    const mine = { id: 't-japan:s1', tripId: 't-japan', stepId: 's1', doneAt: '2026-10-14T03:31:00Z' };
    const theirs = { id: 't-japan:s1', tripId: 't-japan', stepId: 's1', doneAt: '2026-10-14T03:29:00Z', rev: 1 };
    expect(sameMeaning(mine, theirs)).toBe(true);
  });
  it('still asks when the versions really differ', () => {
    expect(sameMeaning({ id: 'doc5', offline: true }, { id: 'doc5', offline: false })).toBe(false);
    expect(sameMeaning({ id: 'doc5', offline: true }, undefined)).toBe(false);
  });
});
