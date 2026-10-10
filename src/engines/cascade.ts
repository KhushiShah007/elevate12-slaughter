import type {
  Accommodation,
  CascadeEffect,
  CascadeResult,
  FamilyPickup,
  Flight,
  FlightStatus,
  Iso,
  JourneyStep,
  RiskLevel,
  TransportBooking,
} from '../types';
import { MIN_CONNECTION_MIN } from './connectionRisk';
import { hhmm, inZoneOf, isAfter, minutesBetween, shift, shiftClock, span } from './time';

// Plain rules, no AI. Every number the engine uses is named here so it can be explained.
export const RULES = {
  minConnectionMin: MIN_CONNECTION_MIN, // shortest safe change of planes
  tightConnectionMin: MIN_CONNECTION_MIN + 60, // under this, the connection is "tight"
  arrivalExitMin: 60, // landing -> out of arrivals with bags
  transportTightMin: 20, // less spare time than this before a timed ticket is tight
  hotelTightMin: 30, // reaching the hotel within this of its late-arrival limit is tight
  familyNoticeMin: 15, // smaller shifts in the family leave-home time are not worth a message
  sameNightHours: 6, // timed ground transport within this of landing depends on the arrival
};

export interface CascadeInput {
  flights: Flight[];
  accommodations: Accommodation[];
  transport: TransportBooking[];
  steps: JourneyStep[];
  pickup: FamilyPickup | null;
}

export type CascadeEvent =
  | { kind: 'delay'; flightId: string; minutes: number }
  | { kind: 'prepone'; flightId: string; minutes: number }
  | { kind: 'missed'; flightId: string };

export interface CascadeOutput extends CascadeResult {
  /** Family leave-home clock now, and before the event. null = on hold for a new flight. */
  familyLeave: string | null;
  familyLeaveWas: string | null;
}

/** The disruption currently recorded in flight statuses, if any. */
export function eventFromStatuses(statuses: FlightStatus[]): CascadeEvent | null {
  const missed = statuses.find((s) => s.missed);
  if (missed) return { kind: 'missed', flightId: missed.flightId };
  const delayed = statuses.find((s) => s.delayMin > 0);
  if (delayed) return { kind: 'delay', flightId: delayed.flightId, minutes: delayed.delayMin };
  const preponed = statuses.find((s) => s.preponedMin > 0);
  if (preponed) return { kind: 'prepone', flightId: preponed.flightId, minutes: preponed.preponedMin };
  return null;
}

const levelFor = (left: number, tight: number): RiskLevel => (left < 0 ? 'bad' : left < tight ? 'warn' : 'ok');

/**
 * Apply one changed event to the trip and work out every knock-on effect:
 * connections, the leave-home time and airport cab, timed ground transport,
 * the first hotel's late-arrival limit, and the family pickup.
 */
export function runCascade(input: CascadeInput, event: CascadeEvent | null): CascadeOutput {
  const legs = [...input.flights].sort((a, b) => a.depart.localeCompare(b.depart));
  if (!legs.length) {
    return { headline: 'No flights on this trip', trigger: '', effects: [], brokenAt: null, newArrival: null, familyLeave: null, familyLeaveWas: null };
  }

  const idx = event ? legs.findIndex((l) => l.id === event.flightId) : -1;
  const hit = idx >= 0 ? legs[idx] : null;
  const delta = !event || event.kind === 'missed' ? 0 : event.kind === 'delay' ? event.minutes : -event.minutes;

  // 1. New times for the changed leg.
  const moved = legs.map((l, i) => (i === idx ? { ...l, depart: shift(l.depart, delta), arrive: shift(l.arrive, delta) } : l));

  // 2. Walk the connections; the first one that cannot be made breaks the chain.
  const effects: CascadeEffect[] = [];
  let brokenAt: string | null = event?.kind === 'missed' ? event.flightId : null;
  for (let j = 1; j < moved.length && !brokenAt; j++) {
    const before = moved[j - 1];
    const next = moved[j];
    const left = minutesBetween(before.arrive, next.depart);
    const was = minutesBetween(legs[j - 1].arrive, legs[j].depart);
    const level: RiskLevel = left < RULES.minConnectionMin ? 'bad' : left < RULES.tightConnectionMin ? 'warn' : 'ok';
    const detail =
      level === 'bad'
        ? left < 0
          ? `${before.flightNo} now lands after ${next.flightNo} leaves. You will miss it.`
          : `${span(left)} left in ${before.toCity}, minimum is ${span(RULES.minConnectionMin)}. You will likely miss it.`
        : level === 'warn'
          ? `Tight: ${span(left)} to change planes in ${before.toCity}. Go straight to transfers.`
          : left !== was
            ? `${left > was ? 'Grows' : 'Shrinks'} to ${span(left)} in ${before.toCity}. Still enough time.`
            : `${span(left)} in ${before.toCity}. Enough time to connect.`;
    effects.push({ id: `conn-${next.id}`, icon: 'plane', label: `Connection ${next.flightNo}`, detail, level });
    if (level === 'bad') brokenAt = next.id;
  }

  // 3. Before departure: a prepone pulls the leave-home time and airport cab earlier.
  if (event?.kind === 'prepone' && idx === 0 && input.steps.length) {
    const home = input.steps[0];
    const newLeave = shiftClock(home.at, delta);
    effects.unshift({ id: 'leave-home', icon: 'clock', label: 'Leave home', detail: `Leave at ${newLeave} instead of ${home.at}.`, level: 'warn' });
    input.transport
      .filter((t) => !isAfter(t.at, legs[0].depart))
      .forEach((t) => {
        const tooLate = -delta >= 10;
        effects.splice(1, 0, {
          id: `pre-${t.id}`,
          icon: 'car',
          label: t.title,
          detail: tooLate ? `${hhmm(t.at)} pickup is now too late. Move it to ${newLeave}.` : `Pickup at ${hhmm(t.at)} still works, just.`,
          level: tooLate ? 'bad' : 'warn',
        });
      });
  } else if (event?.kind === 'delay' && idx === 0 && input.steps.length) {
    effects.unshift({
      id: 'leave-home',
      icon: 'clock',
      label: 'Leave home',
      detail: `Keep ${input.steps[0].at}. Delays can shrink, and check-in closes on the original schedule.`,
      level: 'ok',
    });
  }

  // 4. After landing: everything that hangs off the final arrival.
  const last = legs[legs.length - 1];
  const arrivalWas = last.arrive;
  const certain = event?.kind === 'missed';
  const brokenLeg = brokenAt ? legs.find((l) => l.id === brokenAt) : null;
  const newArrival: Iso | null = brokenAt ? null : moved[moved.length - 1].arrive;
  const arrivalShift = newArrival ? minutesBetween(arrivalWas, newArrival) : null;
  const ifMissed = brokenLeg && !certain ? `If you miss ${brokenLeg.flightNo}, ` : '';
  const brokenLevel: RiskLevel = certain ? 'bad' : 'warn';
  // "If you miss X, your ticket…" when it is likely; "Your ticket…" when it is certain.
  const lead = (rest: string) => (ifMissed ? ifMissed + rest : rest[0].toUpperCase() + rest.slice(1));

  input.transport
    // Metro cards and passes are not tied to a departure time, so they never break.
    .filter((t) => t.mode !== 'metro' && isAfter(t.at, arrivalWas) && minutesBetween(arrivalWas, t.at) <= RULES.sameNightHours * 60)
    .forEach((t) => {
      if (!newArrival) {
        effects.push({ id: `post-${t.id}`, icon: 'car', label: t.title, detail: lead(`your ${hhmm(t.at)} ticket will lapse. Ask for a refund before it leaves.`), level: brokenLevel });
        return;
      }
      const ready = shift(newArrival, RULES.arrivalExitMin);
      const spare = minutesBetween(ready, inZoneOf(t.at, ready));
      const level = levelFor(spare, RULES.transportTightMin);
      const detail =
        level === 'bad'
          ? `You'd be out of arrivals at ${hhmm(ready)}, after it leaves at ${hhmm(t.at)}.`
          : level === 'warn'
            ? `Only ${span(spare)} between leaving arrivals and the ${hhmm(t.at)} departure.`
            : arrivalShift
              ? `Still fine: ${span(spare)} to spare.`
              : `No change. ${span(spare)} to spare.`;
      effects.push({ id: `post-${t.id}`, icon: 'car', label: t.title, detail, level });
    });

  const firstStay = [...input.accommodations].sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  if (firstStay?.latestArrival) {
    const limit = firstStay.latestArrival;
    if (!newArrival) {
      effects.push({
        id: `stay-${firstStay.id}`,
        icon: 'hotel',
        label: `${firstStay.name}, night 1`,
        detail: lead(`you won't arrive by the ${hhmm(limit)} late-arrival limit. Tell the hotel so it isn't a no-show.`),
        level: brokenLevel,
      });
    } else {
      const reach = shift(newArrival, RULES.arrivalExitMin + (firstStay.fromAirportMin ?? 0));
      const spare = minutesBetween(reach, inZoneOf(limit, reach));
      const level = levelFor(spare, RULES.hotelTightMin);
      const detail =
        level === 'bad'
          ? `You'd reach about ${hhmm(reach)}, after the ${hhmm(limit)} late-arrival limit. Call to keep night 1.`
          : level === 'warn'
            ? `You'd reach about ${hhmm(reach)}, close to the ${hhmm(limit)} limit. Let them know.`
            : `Reach about ${hhmm(reach)}, before the ${hhmm(limit)} limit.`;
      effects.push({ id: `stay-${firstStay.id}`, icon: 'hotel', label: `${firstStay.name}, night 1`, detail, level });
    }
  }

  // 5. Family pickup at the destination.
  const leaveFor = (arrival: Iso, p: FamilyPickup) => hhmm(shift(arrival, RULES.arrivalExitMin - p.travelMin));
  const familyLeaveWas = input.pickup ? leaveFor(arrivalWas, input.pickup) : null;
  const familyLeave = input.pickup && newArrival ? leaveFor(newArrival, input.pickup) : null;
  if (input.pickup) {
    const who = input.pickup.pickerName;
    if (!newArrival) {
      effects.push({
        id: 'family',
        icon: 'family',
        label: `${who}'s pickup`,
        detail: lead(`tell ${who} not to leave at ${familyLeaveWas}. The new leave-home time depends on the new flight.`),
        level: brokenLevel,
      });
    } else {
      const moves = Math.abs(arrivalShift ?? 0) >= RULES.familyNoticeMin;
      effects.push({
        id: 'family',
        icon: 'family',
        label: `${who}'s pickup`,
        detail: moves ? `Leave home at ${familyLeave} instead of ${familyLeaveWas}.` : `Leave home at ${familyLeave}, as planned.`,
        level: moves ? 'warn' : 'ok',
      });
    }
  }

  // 6. Headline for the trigger.
  let headline = 'Everything is on time';
  let trigger = `${legs[0].flightNo} departs ${hhmm(legs[0].depart)} from ${legs[0].fromCode} ${legs[0].terminal}`;
  if (event && hit) {
    const now = moved[idx];
    if (event.kind === 'delay') {
      headline = event.minutes ? `${hit.flightNo} is delayed ${span(event.minutes)}` : `${hit.flightNo} is on time`;
      trigger = `Departs ${hhmm(now.depart)} from ${hit.fromCode} ${hit.terminal}${event.minutes ? ` (was ${hhmm(hit.depart)})` : ''}`;
    } else if (event.kind === 'prepone') {
      headline = event.minutes ? `${hit.flightNo} now leaves ${span(event.minutes)} earlier` : `${hit.flightNo} is on time`;
      trigger = `Departs ${hhmm(now.depart)}${event.minutes ? ` (was ${hhmm(hit.depart)})` : ''}`;
    } else {
      headline = `You missed ${hit.flightNo} to ${hit.toCity}`;
      trigger = `It left ${hit.fromCode} at ${hhmm(hit.depart)}.`;
    }
  }

  return { headline, trigger, effects, brokenAt, newArrival, familyLeave, familyLeaveWas };
}
