// Providers: Auth, DB, Sync, Theme
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { clearUserData, discardUserOutbox, getUserOutboxCount } from '@local-data/database';
import { syncEngine, SyncState } from '@local-data/sync-engine';
import { api, appFetch } from '@shared/api/client';
import type { UserPublic } from '@contracts/auth';
import { LOGIN_ATTEMPT_KEY, OFFLINE_LOGOUT_KEY, runLogoutFlow, shouldRestoreStoredSession } from './logout-flow';
import type { LogoutFlowResult, PendingLogoutAction } from './logout-flow';

export interface LogoutOptions {
  pendingAction?: PendingLogoutAction;
  accountDeleted?: boolean;
}

function readClientFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeClientFlag(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Local flags improve logout continuity; API authorization remains server-side.
  }
}

function clearClientFlag(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage.
  }
}

interface AuthContextType {
  user: UserPublic | null;
  session: any | null;
  loading: boolean;
  onboardingComplete: boolean;
  login: () => Promise<void>;
  logout: (options?: LogoutOptions) => Promise<LogoutFlowResult>;
  completeOnboarding: () => Promise<void>;
  syncState: SyncState;
  syncNow: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [syncEpoch, setSyncEpoch] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle', lastSync: null, pendingCount: 0, error: null });
  
  useEffect(() => {
    const initAuth = async () => {
      try {
        const localLogoutPending = readClientFlag(OFFLINE_LOGOUT_KEY) === '1';
        const loginAttempted = readClientFlag(LOGIN_ATTEMPT_KEY) === '1';
        if (!shouldRestoreStoredSession(localLogoutPending, loginAttempted)) return;

        const response = await api.getSession();
        if (response.data) {
          clearClientFlag(OFFLINE_LOGOUT_KEY);
          clearClientFlag(LOGIN_ATTEMPT_KEY);
          setUser(response.data);
          setSession(response.data);
          setOnboardingComplete(true);
          const bootstrap = await api.getBootstrap();
          if (bootstrap.error || !bootstrap.data) throw new Error(bootstrap.error?.message ?? 'No pudimos cargar tu cuenta.');
          if (bootstrap.data.userId !== response.data.id) throw new Error('La sesión cambió durante el inicio.');
          setSyncEpoch(bootstrap.data.syncEpoch);
          await syncEngine.initialize(response.data.id, bootstrap.data.syncEpoch);
        } else {
          clearClientFlag(LOGIN_ATTEMPT_KEY);
          if (localLogoutPending) return;
          setUser(null);
          setSession(null);
          setOnboardingComplete(false);
          setSyncEpoch(null);
        }
      } catch (error) {
        setSyncState({
          status: 'error',
          lastSync: null,
          pendingCount: 0,
          error: error instanceof Error ? error.message : 'No pudimos cargar tu cuenta.'
        });
      } finally {
        setLoading(false);
      }
    };
    initAuth();
    
    const unsubscribe = syncEngine.subscribe(setSyncState);
    return unsubscribe;
  }, []);
  
  const login = useCallback(async () => {
    const res = await appFetch('/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ provider: 'google', callbackURL: window.location.origin + '/' })
    });
    const data: any = await res.json().catch(() => null);
    if (data?.url) {
      writeClientFlag(LOGIN_ATTEMPT_KEY, '1');
      window.location.href = data.url;
      return;
    }
    throw new Error(data?.message || 'No se pudo iniciar sesión con Google');
  }, []);

  const syncForUser = useCallback(async (ownerId: string) => {
    let epoch = syncEpoch;
    if (!epoch) {
      const bootstrap = await api.getBootstrap();
      if (bootstrap.error || !bootstrap.data) throw new Error(bootstrap.error?.message ?? 'No pudimos cargar tu cuenta.');
      if (bootstrap.data.userId !== ownerId) throw new Error('La sesión cambió antes de sincronizar.');
      epoch = bootstrap.data.syncEpoch;
      setSyncEpoch(epoch);
    }
    await syncEngine.syncNow(ownerId, epoch);
  }, [syncEpoch]);
  
  const logout = useCallback(async (options: LogoutOptions = {}): Promise<LogoutFlowResult> => {
    const userId = user?.id;
    if (!userId) {
      window.location.href = '/login';
      return { status: 'done' };
    }

    const online = navigator.onLine;
    return runLogoutFlow({
      userId,
      online,
      pendingAction: options.pendingAction,
      accountDeleted: options.accountDeleted
    }, {
      getUnsentCount: getUserOutboxCount,
      sync: syncForUser,
      signOut: async () => {
        const response = await appFetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
        if (!response.ok && response.status !== 401) throw new Error('No pudimos cerrar la sesión. Probá de nuevo.');
      },
      clearUserData,
      discardUserOutbox,
      finish: () => {
        if (online) {
          clearClientFlag(OFFLINE_LOGOUT_KEY);
          clearClientFlag(LOGIN_ATTEMPT_KEY);
        } else {
          writeClientFlag(OFFLINE_LOGOUT_KEY, '1');
          clearClientFlag(LOGIN_ATTEMPT_KEY);
        }
        setUser(null);
        setSession(null);
        setOnboardingComplete(false);
        setSyncState({ status: 'idle', lastSync: null, pendingCount: 0, error: null });
        window.location.href = '/login';
      }
    });
  }, [syncForUser, user?.id]);
  
  const completeOnboarding = useCallback(async () => {
    setOnboardingComplete(true);
  }, []);

  const syncNow = useCallback(async () => {
    if (user) await syncForUser(user.id);
  }, [syncForUser, user]);
  
  return (
    <AuthContext.Provider value={{
      user, session, loading, onboardingComplete,
      login, logout, completeOnboarding, syncState, syncNow
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthProvider as Providers, useAuth };

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
