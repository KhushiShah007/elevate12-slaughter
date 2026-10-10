import type { CascadeEffect, CascadeResult, Flight, RiskLevel } from '../types';
import { hhmm, minutesBetween, shift, span } from './time';

// Typical times for a domestic -> international change at a large Indian hub.
export const TRANSFER_STEPS = [
  { id: 'walk', label: 'Walk to transfers', min: 15 },
  { id: 'security', label: 'Transfer security', min: 25 },
  { id: 'emigration', label: 'Emigration', min: 35 },
  { id: 'gate', label: 'Walk to the gate', min: 15 },
];
export const GATE_CLOSES_BEFORE_MIN = 20;
const TIGHT_FREE_MIN = 30;

/** How a connection's time splits into must-do steps and free time. */
export function layoverPlan(arriving: Flight, departing: Flight, delayMin = 0) {
  const lands = shift(arriving.arrive, delayMin);
  const layoverMin = minutesBetween(lands, departing.depart);
  const needMin = TRANSFER_STEPS.reduce((s, x) => s + x.min, 0);
  const gateCloses = shift(departing.depart, -GATE_CLOSES_BEFORE_MIN);
  const freeMin = layoverMin - needMin - GATE_CLOSES_BEFORE_MIN;
  const level: RiskLevel = freeMin < 0 ? 'bad' : freeMin < TIGHT_FREE_MIN ? 'warn' : 'ok';
  return { lands, layoverMin, needMin, gateCloses, freeMin, level };
}

/** Connection and layover help, in the same shape as a cascade so one screen shows both. */
export function connectionView(arriving: Flight, departing: Flight, delayMin: number, focus: 'connecting' | 'layover'): CascadeResult {
  const p = layoverPlan(arriving, departing, delayMin);
  const where = `${arriving.toCity} ${departing.terminal}`;
  const free: CascadeEffect = {
    id: 'free',
    icon: 'coffee',
    label: p.freeMin < 0 ? 'Not enough time' : 'Free time',
    detail:
      p.freeMin < 0
        ? `You are ${span(-p.freeMin)} short. Ask Air India staff at arrivals for a fast-track transfer.`
        : `About ${span(p.freeMin)} after transfers and emigration.`,
    level: p.level,
  };
  const gate: CascadeEffect = {
    id: 'gate',
    icon: 'plane',
    label: departing.gate ? `Be at gate ${departing.gate} by ${hhmm(p.gateCloses)}` : `Be at the gate by ${hhmm(p.gateCloses)}`,
    detail: `${departing.flightNo} boarding closes ${GATE_CLOSES_BEFORE_MIN} min before ${hhmm(departing.depart)}.`,
    level: 'ok',
  };
  const steps: CascadeEffect[] = TRANSFER_STEPS.map((s) => ({ id: s.id, icon: 'clock', label: s.label, detail: `About ${span(s.min)}`, level: 'ok' }));

  if (focus === 'connecting') {
    return {
      headline: `${span(p.layoverMin)} to connect in ${arriving.toCity}`,
      trigger: `${arriving.flightNo} lands ${hhmm(p.lands)} · ${departing.flightNo} gate closes ${hhmm(p.gateCloses)}`,
      effects: [...steps, free],
      brokenAt: p.freeMin < 0 ? departing.id : null,
      newArrival: null,
    };
  }
  return {
    headline: `${span(p.layoverMin)} layover at ${where}`,
    trigger: p.freeMin < 0 ? 'Your connection is tight. Here is the fastest way through.' : 'Nothing is broken. Here is how to use the time.',
    effects: [{ id: 'need', icon: 'clock', label: 'Transfer and emigration', detail: `About ${span(p.needMin)} in total`, level: 'ok' }, free, gate],
    brokenAt: p.freeMin < 0 ? departing.id : null,
    newArrival: null,
  };
}
