'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createClient, XeniaClient } from '@xenia/sdk';
import type { OrgSummary, Role, UserSummary } from '@xenia/sdk';

const STORAGE_KEY = 'xenia_session';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: UserSummary;
  org: OrgSummary;
  role: Role;
}

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: Status;
  user: UserSummary | null;
  org: OrgSummary | null;
  role: Role | null;
  client: XeniaClient;
  setSession: (session: StoredSession) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.accessToken || !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSessionState] = useState<StoredSession | null>(null);
  // The SDK reads tokens synchronously from this ref, never from React state,
  // so a refreshed token is visible to the very next request even mid-render.
  const sessionRef = useRef<StoredSession | null>(null);

  const persist = useCallback((next: StoredSession | null) => {
    sessionRef.current = next;
    setSessionState(next);
    if (typeof window !== 'undefined') {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const client = useMemo(
    () =>
      createClient({
        baseUrl: API_BASE_URL,
        getAccessToken: () => sessionRef.current?.accessToken,
        getRefreshToken: () => sessionRef.current?.refreshToken,
        onTokensRefreshed: (accessToken, refreshToken) => {
          if (!sessionRef.current) return;
          persist({ ...sessionRef.current, accessToken, refreshToken });
        },
        onSessionExpired: () => {
          persist(null);
          setStatus('unauthenticated');
        },
      }),
    [persist],
  );

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      sessionRef.current = stored;
      setSessionState(stored);
      setStatus('authenticated');
    } else {
      setStatus('unauthenticated');
    }
  }, []);

  const setSession = useCallback(
    (next: StoredSession) => {
      persist(next);
      setStatus('authenticated');
    },
    [persist],
  );

  const logout = useCallback(async () => {
    const refreshToken = sessionRef.current?.refreshToken;
    persist(null);
    setStatus('unauthenticated');
    if (refreshToken) {
      try {
        await client.auth.logout(refreshToken);
      } catch {
        // best-effort — the local session is already cleared either way
      }
    }
  }, [client, persist]);

  const value: AuthContextValue = {
    status,
    user: session?.user ?? null,
    org: session?.org ?? null,
    role: session?.role ?? null,
    client,
    setSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
