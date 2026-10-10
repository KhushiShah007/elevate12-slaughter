import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';

// Autosave for the New Trip form. Every change is kept on the device straight away and
// sent to the account a moment later, so a half-planned trip survives a closed tab,
// a lost connection or a switch to another device.

export interface DraftData {
  title: string;
  from: string;
  to: string;
  startDate: string;
  endDate: string;
  travellers: number;
  budgetInr: string; // as typed
}

interface Stored {
  id?: string;
  version: number;
  data: DraftData;
  updatedAt: string;
}

interface ServerDraft {
  id: string;
  version: number;
  data: DraftData;
  updatedAt: string;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'device' | 'error';

const KEY = 'voyage.tripDraft';
const read = (): Stored | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
};
const write = (v: Stored | null) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the account copy still works */
  }
};

const isEmpty = (d: DraftData) => !d.title && !d.to && !d.startDate && !d.endDate && !d.budgetInr;

export function useTripDraft(blank: DraftData) {
  const [data, setData] = useState<DraftData>(() => ({ ...blank, ...read()?.data }));
  const [resumed, setResumed] = useState(() => Boolean(read() && !isEmpty({ ...blank, ...read()!.data })));
  const [save, setSave] = useState<SaveState>('idle');
  const meta = useRef<{ id?: string; version: number }>({ id: read()?.id, version: read()?.version ?? 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const touched = useRef(false);
  const pending = useRef<DraftData | null>(null);

  // A newer draft from another device wins over this device's copy (only before typing here).
  useEffect(() => {
    api<{ draft: ServerDraft | null }>('GET', '/trips/draft')
      .then(({ draft }) => {
        if (!draft || touched.current) return;
        const local = read();
        if (local && local.updatedAt > draft.updatedAt && local.id === draft.id) return;
        meta.current = { id: draft.id, version: draft.version };
        setData({ ...blank, ...draft.data });
        setResumed(!isEmpty({ ...blank, ...draft.data }));
        write({ id: draft.id, version: draft.version, data: { ...blank, ...draft.data }, updatedAt: draft.updatedAt });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = useCallback(async (next: DraftData, retried = false): Promise<void> => {
    setSave('saving');
    try {
      const { draft } = await api<{ draft: ServerDraft }>('PUT', '/trips/draft', { id: meta.current.id, data: next, version: meta.current.version, step: 'details' });
      meta.current = { id: draft.id, version: draft.version };
      write({ id: draft.id, version: draft.version, data: next, updatedAt: new Date().toISOString() });
      setSave('saved');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // The draft was used up elsewhere: start a fresh one next time.
        meta.current = { version: 0 };
        setSave('device');
      } else if (err instanceof ApiError && err.status === 409 && !retried) {
        // Another device saved in between: this device's newer typing goes on top of it.
        const latest = await api<{ draft: ServerDraft | null }>('GET', '/trips/draft').catch(() => null);
        if (latest?.draft && latest.draft.id === meta.current.id) meta.current.version = latest.draft.version;
        return push(next, true);
      } else setSave(err instanceof ApiError && err.offline ? 'device' : 'error');
    }
  }, []);

  const update = useCallback(
    (patch: Partial<DraftData>) => {
      touched.current = true;
      setData((d) => {
        const next = { ...d, ...patch };
        write({ ...meta.current, data: next, updatedAt: new Date().toISOString() });
        clearTimeout(timer.current);
        pending.current = next;
        timer.current = setTimeout(() => {
          pending.current = null;
          void push(next);
        }, 700);
        return next;
      });
    },
    [push],
  );

  /** Forget the draft (trip created, or "start over"). */
  const discard = useCallback(async () => {
    clearTimeout(timer.current);
    pending.current = null;
    const id = meta.current.id;
    meta.current = { version: 0 };
    write(null);
    setData(blank);
    setResumed(false);
    setSave('idle');
    if (id) await api('DELETE', `/trips/draft/${id}`).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the screen mid-typing: send the last change now instead of dropping it.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current) void push(pending.current);
    },
    [push],
  );

  return { data, update, discard, resumed, save };
}
