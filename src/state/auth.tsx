import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type Me } from '../api/client';
import { db } from '../db/db';
import { useSettings } from './settings';

// Who is signed in. The server session (httpOnly cookie) is the truth; a copy of the
// profile is kept on the device so Voyage still opens signed in when offline.

type Status = 'loading' | 'signedIn' | 'signedOut';

interface AuthApi {
  status: Status;
  me: Me | null;
  /** Call with the `me` returned by sign-up / log-in. */
  signedIn: (me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  /** Save profile fields to the server (and the device copy). */
  saveProfile: (patch: Partial<Pick<Me, 'name' | 'homeCity' | 'language' | 'seniorMode'>> & { personaAnswers?: Record<string, string>; personaNotes?: Record<string, string> }) => Promise<Me | null>;
}

const CACHE_KEY = 'voyage.me';
const PENDING_KEY = 'voyage.profilePending';

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeJson = (key: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
};

/** Mirror the account into the on-device database the rest of the app reads. */
async function mirror(me: Me) {
  await db.transaction('rw', db.users, db.preferences, db.meta, async () => {
    await db.users.put({ id: me.id, name: me.name, phoneOrEmail: me.contact, homeCity: me.homeCity ?? '' });
    await db.meta.put({ key: 'currentUserId', value: me.id });
    if (me.personaAnswers) {
      await db.preferences.put({ userId: me.id, answers: me.personaAnswers, notes: me.personaNotes ?? {}, updatedAt: new Date().toISOString() });
    }
  });
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [me, setMe] = useState<Me | null>(() => readJson<Me>(CACHE_KEY));
  const [status, setStatus] = useState<Status>(() => (readJson<Me>(CACHE_KEY) ? 'signedIn' : 'loading'));
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const accept = useCallback(async (next: Me) => {
    setMe(next);
    setStatus('signedIn');
    writeJson(CACHE_KEY, next);
    await mirror(next).catch(() => undefined);
  }, []);

  const signedIn = useCallback(
    async (next: Me) => {
      await accept(next);
      // The account's language and text size follow the traveller to a new device.
      settingsRef.current.update({ language: next.language, seniorMode: next.seniorMode, signedIn: true });
    },
    [accept],
  );

  const clear = useCallback(() => {
    setMe(null);
    setStatus('signedOut');
    writeJson(CACHE_KEY, null);
    writeJson(PENDING_KEY, null);
    settingsRef.current.update({ signedIn: false });
  }, []);

  const saveProfile = useCallback<AuthApi['saveProfile']>(
    async (patch) => {
      try {
        const res = await api<{ me: Me }>('PATCH', '/me', patch);
        writeJson(PENDING_KEY, null);
        await accept(res.me);
        return res.me;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) clear();
        // Offline: keep the change and send it when the connection is back.
        else if (err instanceof ApiError && err.offline) writeJson(PENDING_KEY, { ...readJson<Record<string, unknown>>(PENDING_KEY), ...patch });
        else throw err;
        return null;
      }
    },
    [accept, clear],
  );

  // On launch and whenever the connection returns: confirm the session, flush offline profile edits.
  useEffect(() => {
    const check = async () => {
      if (!navigator.onLine) {
        setStatus((s) => (s === 'loading' ? (readJson(CACHE_KEY) ? 'signedIn' : 'signedOut') : s));
        return;
      }
      try {
        const pending = readJson<Record<string, unknown>>(PENDING_KEY);
        const res = pending ? await api<{ me: Me }>('PATCH', '/me', pending) : await api<{ me: Me }>('GET', '/me');
        writeJson(PENDING_KEY, null);
        await accept(res.me);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) clear();
        else setStatus((s) => (s === 'loading' ? (readJson(CACHE_KEY) ? 'signedIn' : 'signedOut') : s));
      }
    };
    void check();
    window.addEventListener('online', check);
    return () => window.removeEventListener('online', check);
  }, [accept, clear]);

  // Language and text-size changes made on the Me screen follow the account.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (status !== 'signedIn' || !me) return;
    if (me.language === settings.language && me.seniorMode === settings.seniorMode) return;
    void saveProfile({ language: settings.language, seniorMode: settings.seniorMode }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.language, settings.seniorMode]);

  const signOut = useCallback(async () => {
    await api('POST', '/auth/logout').catch(() => undefined);
    clear();
  }, [clear]);

  const value = useMemo<AuthApi>(() => ({ status, me, signedIn, signOut, saveProfile }), [status, me, signedIn, signOut, saveProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
