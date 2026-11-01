// Providers: Auth, DB, Sync, Theme
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { clearUserData, discardUserOutbox, getLocalUserIds, getUserOutboxCount, requestPersistentStorage } from '@local-data/database';
import { syncEngine, SyncState } from '@local-data/sync-engine';
import { api, appFetch } from '@shared/api/client';
import type { UserPublic } from '@contracts/auth';
import type { LegalAcceptance, LegalAcceptanceInput } from '@contracts/legal';
import type { CurrencyCode } from '@domain/money';
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

async function recoverCompletedAccountDeletions(): Promise<void> {
  const prefix = 'finance-pwa:account-deletion:';
  const knownUsers = new Set<string>();
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const userId = key.slice(prefix.length);
      const requestId = localStorage.getItem(key);
      if (!userId || !requestId) continue;
      knownUsers.add(userId);
      try {
        const status = await api.getAccountDeletionStatus({ requestId });
        if (status.data?.completed) {
          await clearUserData(userId);
          localStorage.removeItem(key);
        } else if (status.data?.found) {
          void resumeDeletionCleanup(userId, { requestId }, key);
        }
      } catch {
        // Keep the recovery token and local data until the server confirms deletion.
      }
    }

    for (const userId of await getLocalUserIds()) {
      if (knownUsers.has(userId)) continue;
      try {
        const lookup = { userId } as const;
        const status = await api.getAccountDeletionStatus(lookup);
        if (status.data?.completed) await clearUserData(userId);
        else if (status.data?.found) void resumeDeletionCleanup(userId, lookup);
      } catch {
        // A later app start will retry with the still-local owner ID.
      }
    }
  } catch {
    // Browser storage can be disabled; never remove financial data as a fallback.
  }
}

async function resumeDeletionCleanup(
  userId: string,
  lookup: { requestId: string } | { userId: string },
  key?: string
): Promise<void> {
  try {
    const result = await api.waitForAccountDeletion(lookup);
    if (result.data?.completed) {
      await clearUserData(userId);
      if (key) localStorage.removeItem(key);
    }
  } catch {
    // Keep local data until the completion receipt is available and cleanup succeeds.
  }
}

interface AuthContextType {
  user: UserPublic | null;
  session: any | null;
  loading: boolean;
  onboardingComplete: boolean;
  legalAcceptance: LegalAcceptance | null;
  defaultCurrency: CurrencyCode;
  login: () => Promise<void>;
  logout: (options?: LogoutOptions) => Promise<LogoutFlowResult>;
  completeOnboarding: (currency: CurrencyCode) => Promise<void>;
  acceptLegalDocuments: (input: LegalAcceptanceInput) => Promise<void>;
  syncState: SyncState;
  syncNow: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [legalAcceptance, setLegalAcceptance] = useState<LegalAcceptance | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>('ARS');
  const [syncEpoch, setSyncEpoch] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle', lastSync: null, pendingCount: 0, error: null });
  const syncRequests = useRef(new Map<string, Promise<void>>());
  
  useEffect(() => {
    const initAuth = async () => {
      try {
        await recoverCompletedAccountDeletions();
        const localLogoutPending = readClientFlag(OFFLINE_LOGOUT_KEY) === '1';
        const loginAttempted = readClientFlag(LOGIN_ATTEMPT_KEY) === '1';
        if (!shouldRestoreStoredSession(localLogoutPending, loginAttempted)) return;

    const response = await api.getSession();
    if (response.data) {
      clearClientFlag(OFFLINE_LOGOUT_KEY);
      clearClientFlag(LOGIN_ATTEMPT_KEY);
      const bootstrap = await api.getBootstrap();
      if (bootstrap.error || !bootstrap.data) throw new Error(bootstrap.error?.message ?? 'No pudimos cargar tu cuenta.');
      if (bootstrap.data.userId !== response.data.id) throw new Error('La sesión cambió durante el inicio.');
      setDefaultCurrency('ARS');
      setUser(response.data);
      setSession(response.data);
      setOnboardingComplete(false);
      setLegalAcceptance(bootstrap.data.legalAcceptance);
          setSyncEpoch(bootstrap.data.syncEpoch);
          setDefaultCurrency(bootstrap.data.defaultCurrency);
          setOnboardingComplete(bootstrap.data.onboardingComplete);
          if (bootstrap.data.legalAcceptance.accepted) {
            const pendingCount = await getUserOutboxCount(response.data.id).catch(() => 0);
            setSyncState({ status: 'syncing', lastSync: null, pendingCount, error: null });
            void requestPersistentStorage();
            await syncEngine.initialize(response.data.id, bootstrap.data.syncEpoch);
          } else {
            setSyncState({ status: 'idle', lastSync: null, pendingCount: 0, error: null });
          }
        } else {
          clearClientFlag(LOGIN_ATTEMPT_KEY);
          if (localLogoutPending) return;
          setUser(null);
          setSession(null);
          setOnboardingComplete(false);
          setLegalAcceptance(null);
          setDefaultCurrency('ARS');
          setSyncEpoch(null);
        }
      } catch (error) {
        setSyncState((current) => ({
          ...current,
          status: 'error',
          error: error instanceof Error ? error.message : 'No pudimos cargar tu cuenta.'
        }));
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

  const syncForUser = useCallback((ownerId: string): Promise<void> => {
    if (!legalAcceptance?.accepted) throw new Error('Aceptá los documentos vigentes antes de sincronizar.');
    const pending = syncRequests.current.get(ownerId);
    if (pending) return pending;

    const request: Promise<void> = (async () => {
      let epoch = syncEpoch;
      if (!epoch) {
        const bootstrap = await api.getBootstrap();
        if (bootstrap.error || !bootstrap.data) throw new Error(bootstrap.error?.message ?? 'No pudimos cargar tu cuenta.');
        if (bootstrap.data.userId !== ownerId) throw new Error('La sesión cambió antes de sincronizar.');
        epoch = bootstrap.data.syncEpoch;
        setSyncEpoch(epoch);
        setDefaultCurrency(bootstrap.data.defaultCurrency);
        setOnboardingComplete(bootstrap.data.onboardingComplete);
      }
      await syncEngine.syncNow(ownerId, epoch);
    })().finally(() => {
      if (syncRequests.current.get(ownerId) === request) syncRequests.current.delete(ownerId);
    });
    syncRequests.current.set(ownerId, request);
    return request;
  }, [legalAcceptance?.accepted, syncEpoch]);

  useEffect(() => {
    if (loading || !user || !legalAcceptance?.accepted) return;
    const handleOnline = () => {
      void syncForUser(user.id)
        .catch((error) => {
          setSyncState((current) => ({
            ...current,
            status: 'error',
            error: error instanceof Error ? error.message : 'No se pudo reanudar la sincronización.'
          }));
        });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loading, legalAcceptance?.accepted, syncForUser, user]);
  
  const logout = useCallback(async (options: LogoutOptions = {}): Promise<LogoutFlowResult> => {
    const userId = user?.id;
    if (!userId) {
      window.location.href = '/login';
      return { status: 'done' };
    }

    if (options.accountDeleted) {
      await clearUserData(userId);
      clearClientFlag(OFFLINE_LOGOUT_KEY);
      clearClientFlag(LOGIN_ATTEMPT_KEY);
      setUser(null);
      setSession(null);
      setOnboardingComplete(false);
      setLegalAcceptance(null);
      setDefaultCurrency('ARS');
      setSyncState({ status: 'idle', lastSync: null, pendingCount: 0, error: null });
      window.location.href = '/login';
      return { status: 'done' };
    }

    if (!legalAcceptance?.accepted) {
      const online = navigator.onLine;
      if (online) {
        const response = await appFetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
        if (!response.ok && response.status !== 401) throw new Error('No pudimos cerrar la sesión. Probá de nuevo.');
        clearClientFlag(OFFLINE_LOGOUT_KEY);
      } else {
        writeClientFlag(OFFLINE_LOGOUT_KEY, '1');
      }
      clearClientFlag(LOGIN_ATTEMPT_KEY);
      setUser(null);
      setSession(null);
      setOnboardingComplete(false);
      setLegalAcceptance(null);
      setDefaultCurrency('ARS');
      setSyncState({ status: 'idle', lastSync: null, pendingCount: 0, error: null });
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
        setLegalAcceptance(null);
        setDefaultCurrency('ARS');
        setSyncState({ status: 'idle', lastSync: null, pendingCount: 0, error: null });
        window.location.href = '/login';
      }
    });
  }, [legalAcceptance?.accepted, syncForUser, user?.id]);
  
  const completeOnboarding = useCallback(async (currency: CurrencyCode) => {
    if (!user) throw new Error('No pudimos identificar la cuenta activa.');
    if (!legalAcceptance?.accepted) throw new Error('Aceptá los documentos vigentes antes de continuar.');
    const response = await api.updatePreferences(currency);
    if (response.error) throw new Error(response.error.message);
    setDefaultCurrency(response.data?.defaultCurrency ?? currency);
    setOnboardingComplete(true);
  }, [legalAcceptance?.accepted, user]);

  const acceptLegalDocuments = useCallback(async (input: LegalAcceptanceInput) => {
    const response = await api.acceptLegalDocuments(input);
    if (response.error || !response.data?.accepted) {
      throw new Error(response.error?.message ?? 'No pudimos guardar tu aceptación.');
    }
    if (response.data) setLegalAcceptance(response.data);
  }, []);

  const syncNow = useCallback(async () => {
    if (!legalAcceptance?.accepted) throw new Error('Aceptá los documentos vigentes antes de sincronizar.');
    if (!user) return;
    try {
      await syncForUser(user.id);
    } catch (error) {
      setSyncState((current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : 'No se pudo sincronizar.'
      }));
      throw error;
    }
  }, [legalAcceptance?.accepted, syncForUser, user]);
  
  return (
    <AuthContext.Provider value={{
      user, session, loading, onboardingComplete, legalAcceptance, defaultCurrency,
      login, logout, completeOnboarding, acceptLegalDocuments, syncState, syncNow
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
