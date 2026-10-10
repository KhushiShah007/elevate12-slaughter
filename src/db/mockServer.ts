import type { SyncEntry } from '../types';

// SIMULATED server for the prototype. It stands in for a real backend so the offline
// queue can be demonstrated: idempotency keys, revisions and conflicts all behave as a
// real sync API would. State lives in localStorage on this device only.

export interface ServerState {
  applied: Record<string, true>; // idempotency keys already applied
  records: Record<string, { rev: number; payload: unknown }>; // "table:id" -> latest
}

export type PushResult =
  | { kind: 'applied'; rev: number }
  | { kind: 'duplicate' }
  | { kind: 'conflict'; serverRev: number; serverPayload: unknown };

const KEY = 'voyage.mockServer';
const empty = (): ServerState => ({ applied: {}, records: {} });

/** Pure core of the server: decide what happens to one pushed change. */
export function applyToServer(state: ServerState, entry: SyncEntry, force = false): { state: ServerState; result: PushResult } {
  if (state.applied[entry.key]) return { state, result: { kind: 'duplicate' } };

  const id = `${entry.table}:${entry.recordId}`;
  const current = state.records[id];
  const serverRev = current?.rev ?? 0;

  // Someone else changed this record after our change was made: ask the user.
  if (!force && serverRev > entry.baseRev) {
    return { state, result: { kind: 'conflict', serverRev, serverPayload: current?.payload } };
  }

  const rev = serverRev + 1;
  const records = { ...state.records };
  if (entry.op === 'delete') delete records[id];
  else records[id] = { rev, payload: entry.payload };
  return { state: { applied: { ...state.applied, [entry.key]: true }, records }, result: { kind: 'applied', rev } };
}

function load(): ServerState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ServerState) : empty();
  } catch {
    return empty();
  }
}

function save(state: ServerState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: the mock server forgets, which is fine for a demo */
  }
}

const latency = () => new Promise((r) => setTimeout(r, 250));

export async function pushToServer(entry: SyncEntry, force = false): Promise<PushResult> {
  await latency();
  if (!navigator.onLine) throw new Error('offline');
  const { state, result } = applyToServer(load(), entry, force);
  save(state);
  return result;
}

/** Judge Mode: pretend another device edited a record, so the next push conflicts. */
export function simulateRemoteEdit(table: SyncEntry['table'], recordId: string, payload: unknown) {
  const state = load();
  const id = `${table}:${recordId}`;
  const rev = (state.records[id]?.rev ?? 0) + 1;
  save({ ...state, records: { ...state.records, [id]: { rev, payload } } });
  return rev;
}

export function resetMockServer() {
  save(empty());
}
