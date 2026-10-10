import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useOnline } from './useOnline';

/** How many changes are waiting, which ones conflict, and when we last synced. */
export function useSyncStatus() {
  const online = useOnline();
  const data = useLiveQuery(async () => {
    const [pending, conflicts, last] = await Promise.all([
      db.syncQueue.where('status').equals('pending').count(),
      db.syncQueue.where('status').equals('conflict').toArray(),
      db.meta.get('lastSyncedAt'),
    ]);
    return { pending, conflicts, lastSyncedAt: last?.value ?? null };
  });
  return data ? { ...data, online } : undefined;
}
