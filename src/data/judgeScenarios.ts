import type { DisruptionType } from '../types';

export const judgeScenarios: { type: DisruptionType; title: string; detail: string }[] = [
  { type: 'delay', title: 'Delay first leg 2 h 40 m', detail: 'Breaks the Delhi connection' },
  { type: 'missed', title: 'Miss the connection', detail: 'Gate closed at DEL T3' },
  { type: 'preponed', title: 'Prepone by 50 min', detail: 'Cab and alarm must move' },
  { type: 'connecting', title: 'Tight transfer', detail: 'International re-screening' },
];
