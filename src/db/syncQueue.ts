import { db } from './db';
import { pushToServer } from './mockServer';
import { sameMeaning } from './merge';
import type { SyncEntry, SyncTable } from '../types';

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
    } catch {
      break; // went offline mid-replay; try again on the next 'online' event
    }
    await settle(entry, result);
  }
}

async function settle(entry: SyncEntry, result: Awaited<ReturnType<typeof pushToServer>>) {
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

/** Replay whenever the device comes back online, and once at start-up. */
export function startSync() {
  window.addEventListener('online', () => void replay());
  void replay();
}
