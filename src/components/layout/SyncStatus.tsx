import { useEffect, useState } from 'react';
import { isStoragePersisted } from '../../db/persist';
import { AlertTriangle, CheckCircle2, CloudUpload, RefreshCw } from 'lucide-react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { replay } from '../../db/syncQueue';
import { localTime } from '../../utils/format';
import { ConflictSheet } from './ConflictSheet';

/** Whether the browser promised to keep this app's data (null = it can't tell us). */
export function StorageNote() {
  const [kept, setKept] = useState<boolean | null>(null);
  useEffect(() => {
    void isStoragePersisted().then(setKept);
  }, []);
  if (kept === null) return null;
  return (
    <p className="mt-2 px-1 text-xs text-muted">
      {kept
        ? 'This phone has promised to keep your trips and documents.'
        : 'Your browser may clear saved trips if storage runs low. Add Voyage to your home screen to keep them safe.'}
    </p>
  );
}

/** One line on sync state: saved on device, waiting to sync, or needs a decision. */
export function SyncStatus() {
  const s = useSyncStatus();
  const [open, setOpen] = useState(false);
  if (!s) return null;

  const base = 'flex min-h-[2.5rem] w-full items-center gap-2 rounded-md border px-3 text-left text-xs';

  if (s.conflicts.length) {
    return (
      <>
        <button onClick={() => setOpen(true)} className={`${base} border-bad/30 bg-bad/10 text-ink`}>
          <AlertTriangle size={16} className="shrink-0 text-bad" />
          <span className="flex-1">
            <span className="font-semibold">{s.conflicts.length === 1 ? '1 change' : `${s.conflicts.length} changes`} edited on another device.</span> Choose which to keep.
          </span>
        </button>
        <ConflictSheet open={open} onClose={() => setOpen(false)} conflicts={s.conflicts} />
      </>
    );
  }

  if (s.pending) {
    return (
      <button onClick={() => void replay()} disabled={!s.online} className={`${base} border-warn/40 bg-warn/10 text-ink`}>
        <CloudUpload size={16} className="shrink-0 text-warn" />
        <span className="flex-1">
          <span className="font-semibold">{s.pending === 1 ? '1 change' : `${s.pending} changes`} saved on this phone.</span>{' '}
          {s.online ? 'Syncing…' : 'They will sync when you are back online.'}
        </span>
        {s.online && <RefreshCw size={14} className="shrink-0 animate-spin text-espresso" />}
      </button>
    );
  }

  return (
    <div className={`${base} border-line bg-paper/70 text-espresso`}>
      <CheckCircle2 size={16} className="shrink-0 text-ok" />
      <span>
        Everything saved on this phone{s.lastSyncedAt ? ` · Last synced ${localTime(s.lastSyncedAt)}` : ''}
      </span>
    </div>
  );
}
