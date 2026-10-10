import type { DisruptionType } from '../types';

/** Judge Mode disasters. Each records a simulated flight status, then opens its screen. */
export interface JudgeScenario {
  type: DisruptionType;
  title: string;
  detail: string;
  change: { kind: 'delay' | 'prepone' | 'missed'; flightId: string; minutes?: number };
}

export const JUDGE_TRIP = 't-japan';

export const judgeScenarios: JudgeScenario[] = [
  { type: 'delay', title: 'Delay first leg 2 h 40 m', detail: 'Breaks the Delhi connection', change: { kind: 'delay', flightId: 'f1', minutes: 160 } },
  { type: 'missed', title: 'Miss the connection', detail: 'Gate closed at DEL T3', change: { kind: 'missed', flightId: 'f2' } },
  { type: 'preponed', title: 'Prepone by 50 min', detail: 'Cab and leave-home time move', change: { kind: 'prepone', flightId: 'f1', minutes: 50 } },
  { type: 'connecting', title: 'Tight transfer', detail: 'First leg 70 min late', change: { kind: 'delay', flightId: 'f1', minutes: 70 } },
];
