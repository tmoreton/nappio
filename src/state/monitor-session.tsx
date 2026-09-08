import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { MonitorSession } from '@/types/monitor';

type MonitorSessionContextValue = {
  session: MonitorSession | null;
  setSession: (session: MonitorSession) => void;
  clearSession: () => void;
};

const MonitorSessionContext = createContext<MonitorSessionContextValue | null>(null);

export function MonitorSessionProvider({ children }: PropsWithChildren) {
  const [session, setSessionValue] = useState<MonitorSession | null>(null);
  const setSession = useCallback((value: MonitorSession) => setSessionValue(value), []);
  const clearSession = useCallback(() => setSessionValue(null), []);
  const value = useMemo(
    () => ({ session, setSession, clearSession }),
    [clearSession, session, setSession],
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
