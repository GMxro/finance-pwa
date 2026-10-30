export type PendingLogoutAction = 'preserve' | 'discard';

export const OFFLINE_LOGOUT_KEY = 'finance-pwa:offline-logout';
export const LOGIN_ATTEMPT_KEY = 'finance-pwa:login-attempt';

export function shouldRestoreStoredSession(offlineLogoutPending: boolean, explicitLoginAttempt: boolean): boolean {
  return !offlineLogoutPending || explicitLoginAttempt;
}

export interface LogoutFlowInput {
  userId: string;
  online: boolean;
  pendingAction?: PendingLogoutAction;
  accountDeleted?: boolean;
}

export interface LogoutFlowDependencies {
  getUnsentCount(userId: string): Promise<number>;
  sync(userId: string): Promise<void>;
  signOut(): Promise<void>;
  clearUserData(userId: string): Promise<void>;
  discardUserOutbox(userId: string): Promise<void>;
  finish(): void;
}

export type LogoutFlowResult =
  | { status: 'done' }
  | { status: 'pending-confirmation'; pendingCount: number; offline: boolean };

export async function runLogoutFlow(
  input: LogoutFlowInput,
  dependencies: LogoutFlowDependencies
): Promise<LogoutFlowResult> {
  if (input.accountDeleted) {
    await dependencies.clearUserData(input.userId);
    dependencies.finish();
    return { status: 'done' };
  }

  const initialCount = await dependencies.getUnsentCount(input.userId);
  if (!input.pendingAction && initialCount > 0) {
    if (!input.online) {
      return { status: 'pending-confirmation', pendingCount: initialCount, offline: true };
    }

    await dependencies.sync(input.userId);
    const remaining = await dependencies.getUnsentCount(input.userId);
    if (remaining > 0) {
      return { status: 'pending-confirmation', pendingCount: remaining, offline: false };
    }
  }

  if (input.pendingAction === 'discard') {
    await dependencies.discardUserOutbox(input.userId);
  }

  if (input.online) await dependencies.signOut();

  if (input.online && !input.pendingAction) {
    await dependencies.clearUserData(input.userId);
  } else if (!input.online && initialCount === 0) {
    await dependencies.clearUserData(input.userId);
  }

  dependencies.finish();
  return { status: 'done' };
}
