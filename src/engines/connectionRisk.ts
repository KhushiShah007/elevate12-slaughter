import type { RiskLevel } from '../types';

// Minimum connection time we treat as safe for a domestic -> international change.
export const MIN_CONNECTION_MIN = 90;

export { minutesBetween } from './time';

/**
 * Connection risk from the layover left after any delay.
 * green: comfortable, amber: tight, red: below the minimum connection time.
 */
export function connectionRisk(layoverMin: number, delayMin = 0): RiskLevel {
  const left = layoverMin - delayMin;
  if (left < MIN_CONNECTION_MIN) return 'bad';
  if (left < MIN_CONNECTION_MIN + 60) return 'warn';
  return 'ok';
}
