import { useMemo } from 'react';
import { useTrip } from './useTrip';
import { runCascade } from '../engines/cascade';
import { connectionView } from '../engines/layover';
import type { CascadeResult, DisruptionType } from '../types';

/**
 * The knock-on effects for one disruption screen, recomputed whenever the trip or
 * its flight status changes. Delay and prepone act on the first leg.
 */
export function useCascade(tripId: string | undefined, type: DisruptionType) {
  const bundle = useTrip(tripId);
  return useMemo(() => {
    if (!bundle) return bundle; // undefined while loading, null if not found
    const [first, second] = bundle.flights;
    const statusOf = (id?: string) => bundle.statuses.find((s) => s.flightId === id);
    const firstStatus = statusOf(first?.id);
    let result: CascadeResult | null = null;
    let minutes = 0;
    const missedId = bundle.statuses.find((s) => s.missed)?.flightId ?? null;

    if (!first) return { bundle, result, minutes, missedId, status: null };

    if (type === 'delay') {
      minutes = firstStatus?.delayMin ?? 0;
      result = runCascade(bundle, { kind: 'delay', flightId: first.id, minutes });
    } else if (type === 'preponed') {
      minutes = firstStatus?.preponedMin ?? 0;
      result = runCascade(bundle, { kind: 'prepone', flightId: first.id, minutes });
    } else if (type === 'missed') {
      result = missedId ? runCascade(bundle, { kind: 'missed', flightId: missedId }) : null;
    } else if (second) {
      result = connectionView(first, second, firstStatus?.delayMin ?? 0, type);
    }

    const status = type === 'missed' ? statusOf(missedId ?? undefined) : firstStatus;
    return { bundle, result, minutes, missedId, status: status ?? null };
  }, [bundle, type]);
}
