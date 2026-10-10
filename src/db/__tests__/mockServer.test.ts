import { describe, expect, it } from 'vitest';
import { applyToServer, type ServerState } from '../mockServer';
import type { SyncEntry } from '../../types';

const entry = (over: Partial<SyncEntry> = {}): SyncEntry => ({
  key: 'k1',
  table: 'documents',
  recordId: 'doc5',
  op: 'put',
  payload: { offline: true },
  baseRev: 0,
  createdAt: '2026-10-10T10:00:00Z',
  status: 'pending',
  label: 'x',
  ...over,
});

const empty: ServerState = { applied: {}, records: {} };

describe('sync server rules', () => {
  it('applies a change and bumps the revision', () => {
    const { state, result } = applyToServer(empty, entry());
    expect(result).toEqual({ kind: 'applied', rev: 1 });
    expect(state.records['documents:doc5']).toEqual({ rev: 1, payload: { offline: true } });
  });

  it('applies the same idempotency key only once', () => {
    const first = applyToServer(empty, entry());
    const again = applyToServer(first.state, entry());
    expect(again.result).toEqual({ kind: 'duplicate' });
    expect(again.state.records['documents:doc5'].rev).toBe(1);
  });

  it('reports a conflict when someone else changed the record first', () => {
    const other: ServerState = { applied: {}, records: { 'documents:doc5': { rev: 2, payload: { offline: false } } } };
    const { state, result } = applyToServer(other, entry({ baseRev: 1 }));
    expect(result).toEqual({ kind: 'conflict', serverRev: 2, serverPayload: { offline: false } });
    expect(state).toBe(other); // nothing overwritten
  });

  it('lets the user force their version after choosing it', () => {
    const other: ServerState = { applied: {}, records: { 'documents:doc5': { rev: 2, payload: { offline: false } } } };
    const { result } = applyToServer(other, entry({ baseRev: 1 }), true);
    expect(result).toEqual({ kind: 'applied', rev: 3 });
  });
});
