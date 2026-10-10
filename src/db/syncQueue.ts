import { db } from './db';
import { api, ApiError } from '../api/client';
import { sameMeaning } from './merge';
import type { SyncEntry, SyncTable } from '../types';

export type PushResult =
  | { kind: 'applied'; rev: number }
  | { kind: 'duplicate' }
  | { kind: 'conflict'; serverRev: number; serverPayload: unknown };

/** Send one queued change to the Voyage API (POST /api/sync/push). */
async function pushToServer(entry: SyncEntry): Promise<PushResult> {
  const { key, table, recordId, op, payload, baseRev } = entry;
  return api<PushResult>('POST', '/sync/push', { key, table, recordId, op, payload, baseRev });
}

type Rev = { rev?: number };

const tableOf = (t: SyncTable) => db.table(t);

/**
 * Save a record on the device and queue the change for the server, in one transaction.
 * Works the same online or offline; the queue replays when the network is back.
 */
export async function writeAndQueue<T extends object>(table: SyncTable, recordId: string, record: T, label: string) {
  await db.transaction('rw', tableOf(table), db.syncQueue, async () => {
    await tableOf(table).put(record);
    await db.syncQueue.add({
      key: crypto.randomUUID(),
      table,
      recordId,
      op: 'put',
      payload: record,
      baseRev: (record as Rev).rev ?? 0,
      createdAt: new Date().toISOString(),
      status: 'pending',
      label,
    });
  });
  void replay();
}

let running: Promise<void> | null = null;

/** Push pending changes in order. Safe to call often: only one replay runs at a time. */
export function replay(): Promise<void> {
  // The lock is released via .finally on the stored promise. Releasing it inside drain()
  // would run *before* the assignment when drain finishes synchronously (e.g. offline),
  // leaving the lock stuck forever.
  if (!running) running = drain().finally(() => (running = null));
  return running;
}

async function drain() {
  while (navigator.onLine) {
    const entry = await db.syncQueue.where('status').equals('pending').first();
    if (!entry) break;
    let result;
    try {
      result = await pushToServer(entry);
    } catch (err) {
      // The server refused the change itself (bad data): drop it rather than block the queue.
      if (err instanceof ApiError && err.status === 400) {
        console.warn('[sync] change refused by the server', entry.label, err.message);
        await db.syncQueue.delete(entry.seq!);
        continue;
      }
      // Offline, signed out or server busy: keep it and try again later.
      break;
    }
    await settle(entry, result);
  }
}

async function settle(entry: SyncEntry, result: PushResult) {
  const table = tableOf(entry.table);
  await db.transaction('rw', table, db.syncQueue, db.meta, async () => {
    if (result.kind === 'conflict') {
      if (sameMeaning(entry.payload, result.serverPayload)) {
        // Both versions say the same thing: take the server's copy quietly, no question needed.
        await table.put({ ...(result.serverPayload as object), rev: result.serverRev });
        await db.syncQueue.delete(entry.seq!);
        await db.meta.put({ key: 'lastSyncedAt', value: new Date().toISOString() });
        return;
      }
      await db.syncQueue.update(entry.seq!, { status: 'conflict', serverPayload: result.serverPayload, serverRev: result.serverRev });
      return;
    }
    if (result.kind === 'applied') {
      // Remember the server revision on the record, and move later local edits of the
      // same record on top of it (they were made on top of this change, not someone else's).
      await table.update(entry.recordId, { rev: result.rev });
      await db.syncQueue
        .where('status')
        .equals('pending')
        .filter((e) => e.table === entry.table && e.recordId === entry.recordId && e.seq! > entry.seq!)
        .modify({ baseRev: result.rev });
    }
    await db.syncQueue.delete(entry.seq!);
    await db.meta.put({ key: 'lastSyncedAt', value: new Date().toISOString() });
  });
}

/** The user picked which version to keep after a conflict. */
export async function resolveConflict(seq: number, keep: 'mine' | 'theirs') {
  const entry = await db.syncQueue.get(seq);
  if (!entry || entry.status !== 'conflict') return;
  const table = tableOf(entry.table);

  if (keep === 'theirs') {
    await db.transaction('rw', table, db.syncQueue, async () => {
      const theirs = entry.serverPayload as Rev | undefined;
      if (theirs) await table.put({ ...theirs, rev: entry.serverRev });
      else await table.delete(entry.recordId);
      await db.syncQueue.delete(seq);
    });
    return;
  }

  // Keep mine: re-queue on top of the server's version so it wins.
  await db.syncQueue.update(seq, { status: 'pending', baseRev: entry.serverRev ?? entry.baseRev, serverPayload: undefined });
  await replay();
}

/**
 * Bring the account's records onto this device (new phone, cleared storage, or changes
 * made elsewhere). Records with a change still waiting to be sent are left alone.
 */
export async function pullFromServer() {
  const { records } = await api<{ records: { table: SyncTable; recordId: string; payload: unknown; rev: number; deleted: boolean }[] }>('GET', '/sync/pull');
  const waiting = new Set((await db.syncQueue.toArray()).map((e) => `${e.table}:${e.recordId}`));
  const known = new Set(db.tables.map((t) => t.name));
  await db.transaction('rw', db.tables, async () => {
    for (const r of records) {
      if (!known.has(r.table) || waiting.has(`${r.table}:${r.recordId}`)) continue;
      const table = tableOf(r.table);
      const local = (await table.get(r.recordId)) as Rev | undefined;
      if (local?.rev && local.rev >= r.rev) continue;
      if (r.deleted) await table.delete(r.recordId);
      else await table.put({ ...(r.payload as object), rev: r.rev });
    }
  });
}

/** Replay whenever the device comes back online, and once at start-up. */
export function startSync() {
  window.addEventListener('online', () => void replay());
  void replay();
}

/** Delete a record on the device and queue the delete for the server. */
export async function removeAndQueue(table: SyncTable, recordId: string, label: string) {
  await db.transaction('rw', tableOf(table), db.syncQueue, async () => {
    const existing = (await tableOf(table).get(recordId)) as Rev | undefined;
    await tableOf(table).delete(recordId);
    await db.syncQueue.add({
      key: crypto.randomUUID(),
      table,
      recordId,
      op: 'delete',
      payload: null,
      baseRev: existing?.rev ?? 0,
      createdAt: new Date().toISOString(),
      status: 'pending',
      label,
    });
  });
  void replay();
}
