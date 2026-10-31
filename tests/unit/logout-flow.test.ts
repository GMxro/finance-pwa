import { describe, expect, it } from 'vitest';
import { runLogoutFlow, shouldRestoreStoredSession } from '../../src/client/app/logout-flow';

function fakeDependencies(pendingCount: number) {
  const calls: string[] = [];
  let count = pendingCount;
  return {
    calls,
    deps: {
      getUnsentCount: async (userId: string) => { calls.push(`count:${userId}`); return count; },
      sync: async (userId: string) => { calls.push(`sync:${userId}`); count = 0; },
      signOut: async () => { calls.push('signOut'); },
      clearUserData: async (userId: string) => { calls.push(`clear:${userId}`); },
      discardUserOutbox: async (userId: string) => { calls.push(`discard:${userId}`); count = 0; },
      finish: () => { calls.push('finish'); }
    }
  };
}

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('logout flow', () => {
  it('does not restore a server session after offline logout until explicit login starts', () => {
    expect(shouldRestoreStoredSession(true, false)).toBe(false);
    expect(shouldRestoreStoredSession(true, true)).toBe(true);
    expect(shouldRestoreStoredSession(false, false)).toBe(true);
  });

  it('syncs before signing out and clearing an online account', async () => {
    const { calls, deps } = fakeDependencies(2);

    const result = await runLogoutFlow({ userId: USER_A, online: true }, deps);

    expect(result).toEqual({ status: 'done' });
    expect(calls).toEqual([`count:${USER_A}`, `sync:${USER_A}`, `count:${USER_A}`, 'signOut', `clear:${USER_A}`, 'finish']);
  });

  it('asks before an offline logout with unsent work', async () => {
    const { calls, deps } = fakeDependencies(3);

    const result = await runLogoutFlow({ userId: USER_A, online: false }, deps);

    expect(result).toEqual({ status: 'pending-confirmation', pendingCount: 3, offline: true });
    expect(calls).toEqual([`count:${USER_A}`]);
  });

  it('preserves a queue when the user confirms offline logout', async () => {
    const { calls, deps } = fakeDependencies(3);

    const result = await runLogoutFlow({ userId: USER_A, online: false, pendingAction: 'preserve' }, deps);

    expect(result).toEqual({ status: 'done' });
    expect(calls).toEqual([`count:${USER_A}`, 'finish']);
  });

  it('discards only the selected account queue after explicit confirmation', async () => {
    const { calls, deps } = fakeDependencies(3);

    await runLogoutFlow({ userId: USER_A, online: false, pendingAction: 'discard' }, deps);

    expect(calls).toEqual([`count:${USER_A}`, `discard:${USER_A}`, 'finish']);
  });

  it('keeps another account queue untouched when discarding A', async () => {
    const queue = [{ userId: USER_A, id: 'a-op' }, { userId: 'user-b', id: 'b-op' }];
    const { deps } = fakeDependencies(1);
    deps.discardUserOutbox = async (userId: string) => {
      const remaining = queue.filter((operation) => operation.userId !== userId);
      queue.splice(0, queue.length, ...remaining);
    };

    await runLogoutFlow({ userId: USER_A, online: false, pendingAction: 'discard' }, deps);

    expect(queue).toEqual([{ userId: 'user-b', id: 'b-op' }]);
  });

  it('does not sign out if online synchronization leaves unsent changes', async () => {
    const { calls, deps } = fakeDependencies(3);
    deps.sync = async (userId: string) => { calls.push(`sync:${userId}`); };

    const result = await runLogoutFlow({ userId: USER_A, online: true }, deps);

    expect(result).toEqual({ status: 'pending-confirmation', pendingCount: 3, offline: false });
    expect(calls).toEqual([`count:${USER_A}`, `sync:${USER_A}`, `count:${USER_A}`]);
  });

  it('keeps the session and local data when synchronization fails', async () => {
    const { calls, deps } = fakeDependencies(2);
    deps.sync = async (userId: string) => {
      calls.push(`sync:${userId}`);
      throw new Error('network unavailable');
    };

    await expect(runLogoutFlow({ userId: USER_A, online: true }, deps)).rejects.toThrow('network unavailable');
    expect(calls).toEqual([`count:${USER_A}`, `sync:${USER_A}`]);
  });
});
