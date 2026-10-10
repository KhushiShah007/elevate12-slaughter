import { describe, expect, it } from 'vitest';
import { connectionRisk } from '../connectionRisk';

describe('connectionRisk', () => {
  it('grades the remaining layover', () => {
    expect(connectionRisk(200)).toBe('ok');
    expect(connectionRisk(200, 70)).toBe('warn');
    expect(connectionRisk(200, 160)).toBe('bad');
  });
});
