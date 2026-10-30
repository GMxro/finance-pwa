// Local data: Sync engine for offline/online synchronization
import { db, getPendingOutbox, getUserOutboxCount, markOutboxDone, setSyncMeta, getSyncMeta } from './database';
import { api } from '@client/shared/api/client';
import type { SyncPushItem } from '@client/shared/api/client';

export class SyncEngine {
  private syncInFlight: Promise<void> | null = null;
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
    } finally {
      await this.updatePendingCount(userId);
    }
  }
  
  async syncNow(userId: string, epoch: string): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    const run = this.performSyncNow(userId, epoch);
    this.syncInFlight = run;
    try {
      await run;
    } finally {
      if (this.syncInFlight === run) this.syncInFlight = null;
    }
  }

  private async performSyncNow(userId: string, epoch: string): Promise<void> {
    this.setState({ status: 'syncing', error: null });
    
    try {
      await this.pushOutbox(userId, epoch);
      await this.pullChanges(userId, epoch);
      this.setState({ status: 'idle', lastSync: Date.now(), error: null });
    } catch (e: any) {
      this.setState({ status: 'error', error: e.message });
    } finally {
      await this.updatePendingCount(userId);
    }
  }
  
  private async fullSync(userId: string, epoch: string): Promise<void> {
    const response = await api.syncTransactions({ epoch, after: 0, limit: 1000 });
    if (response.error) throw new Error(response.error.message);
    
    const transactions = (response.data?.transactions ?? []) as any[];
    const sequence = response.data?.sequence ?? 0;
    const pendingLocal = await db.transactions.filter((transaction) => !transaction.synced).toArray();
    
    await db.transaction('rw', [db.transactions, db.syncMeta], async () => {
      await db.transactions.clear();
      for (const tx of transactions) {
        await db.transactions.put({ ...tx, userId, synced: true, localVersion: tx.version });
      }
      for (const transaction of pendingLocal) {
        if (!(await db.transactions.get(transaction.id))) await db.transactions.put(transaction);
      }
      await setSyncMeta({ userId, epoch, cursor: sequence, lastPull: Date.now(), lastPush: Date.now() });
    });
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

    const conflictIds = new Set(response.data.conflicts.map((conflict) => conflict.id));
    const completedIds = pending
      .filter((item) => !conflictIds.has(item.entityId))
      .map((item) => item.id);
    if (completedIds.length > 0) await markOutboxDone(completedIds);
    if (response.data.conflicts.length > 0) throw new Error('Algunos cambios requieren revisión antes de sincronizarse.');

    await this.updatePendingCount(userId);
  }
  
  private async pullChanges(userId: string, epoch: string): Promise<void> {
    const meta = await getSyncMeta();
    const cursor = meta?.cursor ?? 0;
    
    const response = await api.syncTransactions({ epoch, after: cursor, limit: 500 });
    if (response.error) throw new Error(response.error.message);
    
    const transactions = (response.data?.transactions ?? []) as any[];
    const tombstones = response.data?.tombstones ?? [];
    const sequence = response.data?.sequence ?? cursor;
    
    await db.transaction('rw', [db.transactions, db.syncMeta], async () => {
      for (const tx of transactions) {
        if (tx.deletedAt) {
          await db.transactions.where('id').equals(tx.id).modify({ synced: true });
        } else {
          await db.transactions.put({ ...tx, userId, synced: true, localVersion: tx.version });
        }
      }
      
      for (const tomb of tombstones) {
        await db.transactions.where('id').equals(tomb.id).modify({ synced: true });
      }
      
      if (meta) {
        await setSyncMeta({
          userId,
          epoch,
          cursor: sequence,
          lastPull: Date.now(),
          lastPush: meta.lastPush
        });
      }
    });
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
