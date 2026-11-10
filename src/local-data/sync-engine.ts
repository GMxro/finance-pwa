// Local data: Sync engine for offline/online synchronization
import { db, getPendingOutbox, getUserOutboxCount, markOutboxDone, setSyncMeta, getSyncMeta } from './database';
import { api } from '@client/shared/api/client';
import type { SyncPushItem } from '@client/shared/api/client';

export class SyncEngine {
  private operationQueue: Promise<void> = Promise.resolve();
  private syncInFlight = new Map<string, Promise<void>>();
  private listeners: Array<(state: SyncState) => void> = [];
  
  private state: SyncState = {
    status: 'idle',
    lastSync: null,
    pendingCount: 0,
    error: null
  };
  
  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  private notify(): void {
    this.listeners.forEach(l => l(this.state));
  }
  
  private setState(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }
  
  async initialize(userId: string, epoch: string): Promise<void> {
    return this.serialize(() => this.performInitialize(userId, epoch));
  }

  private async performInitialize(userId: string, epoch: string): Promise<void> {
    this.setState({ status: 'syncing', error: null });
    try {
      const meta = await getSyncMeta();
      if (!meta || meta.userId !== userId || meta.epoch !== epoch) {
        await this.fullSync(userId, epoch);
        await this.pushOutbox(userId, epoch);
        await this.pullChanges(userId, epoch);
      } else {
        await this.incrementalSync(userId, epoch);
      }
      this.setState({ status: 'idle', lastSync: Date.now(), error: null });
    } catch (error) {
      this.setState({ status: 'error', error: error instanceof Error ? error.message : 'Sync failed' });
      throw error;
    } finally {
      await this.updatePendingCount(userId);
    }
  }
  
  async syncNow(userId: string, epoch: string): Promise<void> {
    const key = `${userId}:${epoch}`;
    const current = this.syncInFlight.get(key);
    if (current) return current;

    const run = this.serialize(() => this.performSyncNow(userId, epoch));
    this.syncInFlight.set(key, run);
    try {
      await run;
    } finally {
      if (this.syncInFlight.get(key) === run) this.syncInFlight.delete(key);
    }
  }

  private serialize(operation: () => Promise<void>): Promise<void> {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async performSyncNow(userId: string, epoch: string): Promise<void> {
    this.setState({ status: 'syncing', error: null });
    
    try {
      await this.pushOutbox(userId, epoch);
      await this.pullChanges(userId, epoch);
      this.setState({ status: 'idle', lastSync: Date.now(), error: null });
    } catch (error) {
      this.setState({ status: 'error', error: error instanceof Error ? error.message : 'Sync failed' });
      throw error;
    } finally {
      await this.updatePendingCount(userId);
    }
  }
  
  private async fullSync(userId: string, epoch: string): Promise<void> {
    const pendingLocal = await db.transactions.filter((transaction) => !transaction.synced && transaction.userId === userId).toArray();
    let cursor = 0;
    let firstPage = true;
    let hasMore = true;

    while (hasMore) {
      const response = await api.syncTransactions({ epoch, after: cursor, limit: 500 });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.userId !== userId) throw new Error('SYNC_USER_MISMATCH');
      const transactions = (response.data?.transactions ?? []) as any[];
      const tombstones = response.data?.tombstones ?? [];
      const nextCursor = response.data?.sequence ?? cursor;
      hasMore = response.data?.hasMore ?? false;
      if (hasMore && nextCursor <= cursor) throw new Error('La sincronización no avanzó el cursor.');

      await db.transaction('rw', [db.transactions], async () => {
        if (firstPage) await db.transactions.where('userId').equals(userId).filter((row) => row.synced).delete();
        for (const tx of transactions) {
          if (tx.deletedAt) {
            const local = await db.transactions.get(tx.id);
            if (local?.userId === userId) {
              await db.transactions.update(tx.id, { deletedAt: tx.deletedAt, synced: true, pendingOp: undefined });
            }
          } else {
            await db.transactions.put({ ...tx, userId, synced: true, pendingOp: undefined, localVersion: tx.version });
          }
        }
        for (const tomb of tombstones) {
          const local = await db.transactions.get(tomb.id);
          if (!local || local.userId === userId) {
            await db.transactions.put({ ...(local ?? {}), id: tomb.id, userId, deletedAt: tomb.deletedAt, synced: true, pendingOp: undefined, localVersion: local?.localVersion ?? 1 } as any);
          }
        }
        const tombstoneIds = new Set(tombstones.map((t: any) => t.id));
        for (const transaction of pendingLocal) {
          if (tombstoneIds.has(transaction.id)) continue;
          if (!(await db.transactions.get(transaction.id))) await db.transactions.put(transaction);
        }
      });
      firstPage = false;
      cursor = nextCursor;
      if (!hasMore) {
        await setSyncMeta({ userId, epoch, cursor, lastPull: Date.now(), lastPush: Date.now() });
      }
    }
  }
  
  private async incrementalSync(userId: string, epoch: string): Promise<void> {
    await this.pushOutbox(userId, epoch);
    await this.pullChanges(userId, epoch);
  }
  
  private async pushOutbox(userId: string, epoch: string): Promise<void> {
    const pending = (await getPendingOutbox(userId)).filter((item) => item.userId === userId);
    if (pending.length === 0) return;
    
    this.setState({ status: 'syncing', pendingCount: pending.length });
    
    const items: SyncPushItem[] = pending.map((item) => ({
      id: item.entityId,
      operationId: item.id,
      userId: item.userId,
      type: item.type,
      payload: item.payload,
      version: item.version
    }));
    
    const response = await api.pushSyncTransactions({ epoch, items });
    
    if (response.error) throw new Error(response.error.message);
    if (!response.data) throw new Error('Respuesta de sincronización vacía.');
    const appliedOperationIds = response.data.appliedOperationIds ?? [];
    const pendingIds = new Set(pending.map((item) => item.id));
    if (response.data.applied + response.data.conflicts.length !== pending.length ||
        appliedOperationIds.length !== response.data.applied ||
        new Set(appliedOperationIds).size !== appliedOperationIds.length ||
        appliedOperationIds.some((id) => !pendingIds.has(id))) {
      throw new Error('La confirmación del servidor no coincide con las operaciones enviadas.');
    }

    if (appliedOperationIds.length > 0) {
      await db.transaction('rw', [db.transactions, db.outbox], async () => {
        for (const item of pending) {
          if (!appliedOperationIds.includes(item.id) || item.type !== 'create') continue;
          const transaction = await db.transactions.get(item.entityId);
          if (transaction?.userId === userId) {
            await db.transactions.update(item.entityId, { synced: true, pendingOp: undefined });
          }
        }
        await markOutboxDone(appliedOperationIds);
      });
    }
    if (response.data.conflicts.length > 0) throw new Error('Algunos cambios requieren revisión antes de sincronizarse.');

    await this.updatePendingCount(userId);
  }
  
  private async pullChanges(userId: string, epoch: string): Promise<void> {
    const meta = await getSyncMeta();
    let cursor = meta?.userId === userId && meta.epoch === epoch ? meta.cursor : 0;
    let hasMore = true;

    while (hasMore) {
      const response = await api.syncTransactions({ epoch, after: cursor, limit: 500 });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.userId !== userId) throw new Error('SYNC_USER_MISMATCH');
      const transactions = (response.data?.transactions ?? []) as any[];
      const tombstones = response.data?.tombstones ?? [];
      const sequence = response.data?.sequence ?? cursor;
      hasMore = response.data?.hasMore ?? false;
      if (hasMore && sequence <= cursor) throw new Error('La sincronización no avanzó el cursor.');

      await db.transaction('rw', [db.transactions, db.syncMeta], async () => {
        for (const tx of transactions) {
          if (tx.deletedAt) {
            const local = await db.transactions.get(tx.id);
            if (local?.userId === userId) {
              await db.transactions.update(tx.id, { deletedAt: tx.deletedAt, synced: true, pendingOp: undefined });
            }
          } else {
            const local = await db.transactions.get(tx.id);
            const serverVersion = tx.version ?? 0;
            if (!local || local.userId !== userId || local.synced || (local.localVersion ?? 0) <= serverVersion) {
              await db.transactions.put({ ...tx, userId, synced: true, pendingOp: undefined, localVersion: tx.version });
            }
          }
        }

        for (const tomb of tombstones) {
          const local = await db.transactions.get(tomb.id);
          if (!local || local.userId === userId) {
            await db.transactions.put({ ...(local ?? {}), id: tomb.id, userId, deletedAt: tomb.deletedAt, synced: true, pendingOp: undefined, localVersion: local?.localVersion ?? 1 } as any);
          }
        }

        await setSyncMeta({ userId, epoch, cursor: sequence, lastPull: Date.now(), lastPush: meta?.lastPush ?? 0 });
      });
      cursor = sequence;
    }
  }
  
  private async updatePendingCount(userId: string): Promise<void> {
    const count = await getUserOutboxCount(userId);
    this.setState({ pendingCount: count });
  }
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  lastSync: number | null;
  pendingCount: number;
  error: string | null;
}

export const syncEngine = new SyncEngine();
