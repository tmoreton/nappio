import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  deleteStoredSession,
  loadStoredSession,
  saveStoredSession,
} from '@/state/session-storage';
import type { MonitorSession } from '@/types/monitor';

type MonitorSessionContextValue = {
  session: MonitorSession | null;
  isHydrated: boolean;
  setSession: (session: MonitorSession) => void;
  refreshSessionExpiry: (sessionExpiresAt: string) => void;
  clearSession: () => void;
};

const MonitorSessionContext = createContext<MonitorSessionContextValue | null>(null);

export function MonitorSessionProvider({ children }: PropsWithChildren) {
  const [session, setSessionValue] = useState<MonitorSession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const revision = useRef(0);
  const sessionRef = useRef<MonitorSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    const startingRevision = revision.current;
    loadStoredSession()
      .then((stored) => {
        if (!cancelled && revision.current === startingRevision) {
          sessionRef.current = stored;
          setSessionValue(stored);
        }
      })
      .catch((error: unknown) => console.warn('Could not restore the monitoring session.', error))
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback((value: MonitorSession) => {
    revision.current += 1;
    sessionRef.current = value;
    setSessionValue(value);
    void saveStoredSession(value).catch((error: unknown) =>
      console.warn('Could not securely save the monitoring session.', error),
    );
  }, []);
  const clearSession = useCallback(() => {
    revision.current += 1;
    sessionRef.current = null;
    setSessionValue(null);
    void deleteStoredSession().catch((error: unknown) =>
      console.warn('Could not remove the saved monitoring session.', error),
    );
  }, []);
  const refreshSessionExpiry = useCallback((sessionExpiresAt: string) => {
    const current = sessionRef.current;
    const nextExpiry = Date.parse(sessionExpiresAt);
    if (!current || !Number.isFinite(nextExpiry)) return;
    if (nextExpiry <= Date.parse(current.sessionExpiresAt)) return;
    const next = { ...current, sessionExpiresAt };
    revision.current += 1;
    sessionRef.current = next;
    setSessionValue(next);
    void saveStoredSession(next).catch((error: unknown) =>
      console.warn('Could not save the renewed monitoring session.', error),
    );
  }, []);
  const value = useMemo(
    () => ({ session, isHydrated, setSession, refreshSessionExpiry, clearSession }),
    [clearSession, isHydrated, refreshSessionExpiry, session, setSession],
  );

  return <MonitorSessionContext.Provider value={value}>{children}</MonitorSessionContext.Provider>;
}

export function useMonitorSession() {
  const value = useContext(MonitorSessionContext);
  if (!value) {
    throw new Error('useMonitorSession must be used inside MonitorSessionProvider');
  }
  return value;
}
