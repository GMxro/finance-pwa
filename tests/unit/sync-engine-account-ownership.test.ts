import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runLogoutFlow } from '../../src/client/app/logout-flow';

const mocks = vi.hoisted(() => {
  const state: { outbox: any[]; transactions: any[]; meta: any } = {
    outbox: [],
    transactions: [],
    meta: null
  };

  const apiPush = vi.fn();
  const apiPull = vi.fn();

  const database = {
    transactions: {
      filter: (predicate: (item: any) => boolean) => ({
        toArray: async () => state.transactions.filter(predicate)
      }),
      clear: async () => { state.transactions = []; },
      put: async (item: any) => {
        state.transactions = [...state.transactions.filter((row) => row.id !== item.id), item];
      },
      get: async (id: string) => state.transactions.find((row) => row.id === id),
      update: async (id: string, changes: any) => {
        state.transactions = state.transactions.map((row) => row.id === id ? { ...row, ...changes } : row);
      },
      where: () => ({ equals: (id: string) => ({ modify: async () => {
        state.transactions = state.transactions.map((row) => row.id === id ? { ...row, synced: true } : row);
      } }) })
    },
    syncMeta: {},
    transaction: async (_mode: string, _tables: unknown[], operation: () => Promise<void>) => operation()
  };

  return {
    state,
    apiPush,
    apiPull,
    database,
    getPendingOutbox: async (userId: string) => state.outbox.filter((item) => item.userId === userId),
    getUserOutboxCount: async (userId: string) => state.outbox.filter((item) => item.userId === userId).length,
    markOutboxDone: async (ids: string[]) => {
      state.outbox = state.outbox.filter((item) => !ids.includes(item.id));
    },
    setSyncMeta: async (meta: any) => { state.meta = meta; },
    getSyncMeta: async () => state.meta
  };
});

vi.mock('../../src/local-data/database', () => ({
  db: mocks.database,
  getPendingOutbox: mocks.getPendingOutbox,
  getUserOutboxCount: mocks.getUserOutboxCount,
  markOutboxDone: mocks.markOutboxDone,
  setSyncMeta: mocks.setSyncMeta,
  getSyncMeta: mocks.getSyncMeta
}));

vi.mock('@client/shared/api/client', () => ({
  api: {
    pushSyncTransactions: mocks.apiPush,
    syncTransactions: mocks.apiPull
  }
}));

import { SyncEngine } from '../../src/local-data/sync-engine';

const EPOCH = '11111111-1111-4111-8111-111111111111';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('SyncEngine account ownership', () => {
  beforeEach(() => {
    mocks.state.outbox = [{
      id: 'op-a',
      userId: USER_A,
      type: 'create',
      entityType: 'transaction',
      entityId: 'tx-a',
      payload: { id: 'tx-a', amountMinor: 1234 },
      createdAt: 1
    }];
    mocks.state.transactions = [{ id: 'tx-a', userId: USER_A, synced: false }];
    mocks.state.meta = { userId: USER_A, epoch: EPOCH, cursor: 0, lastPush: 0, lastPull: 0 };
    mocks.apiPush.mockReset().mockImplementation(async ({ items }: { items: unknown[] }) => ({
      data: { applied: items.length, appliedOperationIds: items.map((item: any) => item.operationId), conflicts: [], newCursor: 0 }, error: null
    }));
    mocks.apiPull.mockReset().mockResolvedValue({
      data: { userId: USER_A, epoch: EPOCH, sequence: 0, transactions: [], tombstones: [], hasMore: false }, error: null
    });
  });

  it('keeps A operations local while B signs in, then sends A once when A returns', async () => {
    const engine = new SyncEngine();
    const logoutDependencies = {
      getUnsentCount: async (userId: string) => mocks.state.outbox.filter((item) => item.userId === userId).length,
      sync: (userId: string) => engine.syncNow(userId, EPOCH),
      signOut: async () => {},
      clearUserData: async (userId: string) => {
        mocks.state.outbox = mocks.state.outbox.filter((item) => item.userId !== userId);
      },
      discardUserOutbox: async (userId: string) => {
        mocks.state.outbox = mocks.state.outbox.filter((item) => item.userId !== userId);
      },
      finish: () => {}
    };

    const prompt = await runLogoutFlow({ userId: USER_A, online: false }, logoutDependencies);
    expect(prompt).toEqual({ status: 'pending-confirmation', pendingCount: 1, offline: true });
    await runLogoutFlow({ userId: USER_A, online: false, pendingAction: 'preserve' }, logoutDependencies);

    await engine.initialize(USER_B, EPOCH).catch(() => undefined);
    expect(mocks.apiPush).not.toHaveBeenCalled();
    expect(mocks.state.outbox.map((item) => item.id)).toEqual(['op-a']);
    expect(mocks.state.transactions).toContainEqual({ id: 'tx-a', userId: USER_A, synced: false });

    await engine.initialize(USER_A, EPOCH);
    expect(mocks.apiPush).toHaveBeenCalledTimes(1);
    expect(mocks.apiPush.mock.calls[0]?.[0].items).toMatchObject([{
      operationId: 'op-a',
      userId: USER_A,
      id: 'tx-a'
    }]);
    expect(mocks.state.outbox.some((item) => item.id === 'op-a')).toBe(false);
    expect(mocks.state.transactions).toContainEqual(expect.objectContaining({ id: 'tx-a', userId: USER_A, synced: true }));

    await engine.syncNow(USER_A, EPOCH);
    expect(mocks.apiPush).toHaveBeenCalledTimes(1);
  });

  it('does not cache a pull response for a different signed-in account', async () => {
    mocks.apiPull.mockResolvedValueOnce({
      data: {
        userId: USER_A,
        epoch: EPOCH,
        sequence: 1,
        transactions: [{ id: 'remote-a', userId: USER_A, version: 1, deletedAt: null }],
        tombstones: [],
        hasMore: false
      },
      error: null
    });
    const engine = new SyncEngine();

    await expect(engine.initialize(USER_B, EPOCH)).rejects.toThrow('SYNC_USER_MISMATCH');

    expect(mocks.state.transactions).not.toContainEqual(expect.objectContaining({ id: 'remote-a', userId: USER_B }));
    expect(mocks.state.transactions).toContainEqual({ id: 'tx-a', userId: USER_A, synced: false });
    expect(mocks.state.outbox).toContainEqual(expect.objectContaining({ id: 'op-a', userId: USER_A }));
  });

  it('keeps operations queued when the server requires a newer build', async () => {
    mocks.apiPush.mockResolvedValueOnce({ data: null, error: { code: 'UPDATE_REQUIRED', message: 'Upgrade required' } });
    const engine = new SyncEngine();

    await expect(engine.syncNow(USER_A, EPOCH)).rejects.toThrow('Upgrade required');

    expect(mocks.state.outbox.map((item) => item.id)).toEqual(['op-a']);
  });

  it('keeps operations queued when a network request fails', async () => {
    mocks.apiPush.mockResolvedValueOnce({ data: null, error: { code: 'NETWORK_ERROR', message: 'offline' } });
    const engine = new SyncEngine();
    let state: any;
    engine.subscribe((next) => { state = next; });

    await expect(engine.syncNow(USER_A, EPOCH)).rejects.toThrow('offline');

    expect(mocks.state.outbox.map((item) => item.id)).toEqual(['op-a']);
    expect(state).toMatchObject({ status: 'error', error: 'offline', pendingCount: 1 });
  });

  it('keeps operations queued when the server reports a conflict', async () => {
    mocks.apiPush.mockResolvedValueOnce({
      data: { applied: 0, conflicts: [{ id: 'tx-a', error: 'CONFLICT' }], newCursor: 0 },
      error: null
    });
    const engine = new SyncEngine();

    await expect(engine.syncNow(USER_A, EPOCH)).rejects.toThrow('requieren revisión');

    expect(mocks.state.outbox.map((item) => item.id)).toEqual(['op-a']);
  });

  it('keeps the outbox when the server confirmation does not identify the sent operation', async () => {
    mocks.apiPush.mockResolvedValueOnce({
      data: { applied: 1, appliedOperationIds: ['another-operation'], conflicts: [], newCursor: 0 },
      error: null
    });
    const engine = new SyncEngine();

    await expect(engine.syncNow(USER_A, EPOCH)).rejects.toThrow('no coincide');

    expect(mocks.state.outbox).toContainEqual(expect.objectContaining({ id: 'op-a', userId: USER_A }));
    expect(mocks.state.transactions).toContainEqual({ id: 'tx-a', userId: USER_A, synced: false });
  });

  it('applies tombstones to local rows without touching rows owned by another account', async () => {
    mocks.state.transactions = [
      { id: 'tx-a', userId: USER_A, synced: true, deletedAt: null },
      { id: 'tx-b', userId: USER_B, synced: true, deletedAt: null }
    ];
    mocks.apiPull.mockResolvedValueOnce({
      data: { userId: USER_A, epoch: EPOCH, sequence: 2, transactions: [], tombstones: [{ id: 'tx-a', deletedAt: 123 }], hasMore: false },
      error: null
    });
    const engine = new SyncEngine();

    await engine.syncNow(USER_A, EPOCH);

    expect(mocks.state.transactions).toContainEqual({ id: 'tx-a', userId: USER_A, synced: true, deletedAt: 123, pendingOp: undefined });
    expect(mocks.state.transactions).toContainEqual({ id: 'tx-b', userId: USER_B, synced: true, deletedAt: null });
  });

  it('waits for an in-flight sync before returning', async () => {
    let finishPush!: (response: unknown) => void;
    mocks.apiPush.mockImplementationOnce(() => new Promise((resolve) => { finishPush = resolve; }));
    const engine = new SyncEngine();
    const first = engine.syncNow(USER_A, EPOCH);
    await vi.waitFor(() => expect(mocks.apiPush).toHaveBeenCalledTimes(1));
    let secondFinished = false;
    const second = engine.syncNow(USER_A, EPOCH).then(() => { secondFinished = true; });

    await Promise.resolve();
    expect(secondFinished).toBe(false);
    finishPush({ data: { applied: 1, appliedOperationIds: ['op-a'], conflicts: [], newCursor: 0 }, error: null });
    await Promise.all([first, second]);

    expect(mocks.apiPush).toHaveBeenCalledTimes(1);
    expect(secondFinished).toBe(true);
  });
});
