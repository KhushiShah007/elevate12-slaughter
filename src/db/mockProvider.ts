import type { RecheckResult, RecoveryCandidate } from '../types';

// SIMULATED airline/hotel provider for "recheck price & seats". A real app would call
// each provider's live API here. Changes are fixed per option so the demo is repeatable,
// and include one price rise, one sell-out and some seats going.
const changes: Record<string, Partial<Pick<RecheckResult, 'farePerPerson' | 'extraStay' | 'seats' | 'soldOut'>>> = {
  'c-ai358': { seats: 5 },
  'c-jl740': { farePerPerson: 19100, seats: 2 },
  'c-overnight': { extraStay: 6900 },
  'c-tg': { seats: 0, soldOut: true },
  'c-meet': { seats: 2 },
  'c-nap': { seats: 1 },
};

export class OfflineError extends Error {
  constructor() {
    super('Rechecking needs internet');
  }
}

/** Ask the (simulated) provider for the current price and seats. Needs internet. */
export async function recheckWithProvider(c: RecoveryCandidate): Promise<RecheckResult> {
  if (!navigator.onLine) throw new OfflineError();
  await new Promise((r) => setTimeout(r, 700));
  if (!navigator.onLine) throw new OfflineError();
  const ch = changes[c.id] ?? {};
  return {
    candidateId: c.id,
    farePerPerson: ch.farePerPerson ?? c.farePerPerson,
    extraStay: ch.extraStay ?? c.extraStay,
    seats: ch.seats ?? c.seats,
    soldOut: ch.soldOut ?? false,
    checkedAt: new Date().toISOString(),
  };
}
