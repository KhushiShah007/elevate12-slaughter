import type { RiskLevel } from '../types';

// Minimum connection time we treat as safe for a domestic -> international change.
export const MIN_CONNECTION_MIN = 90;

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

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
