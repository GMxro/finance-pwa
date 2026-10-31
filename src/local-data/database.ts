import Dexie, { type Table } from 'dexie';
import type { TransactionResponse } from '@contracts/transaction';
import type { CategoryResponse } from '@contracts/category';
import type { BudgetWithSpent } from '@contracts/budget';

export interface LocalTransaction extends TransactionResponse {
  userId: string;
  synced: boolean;
  pendingOp?: 'create' | 'update' | 'delete';
  localVersion: number;
}

export interface LocalCategory extends CategoryResponse {
  synced: boolean;
}

export interface LocalBudget extends BudgetWithSpent {
  synced: boolean;
}

export interface SyncMeta {
  id: string;
  userId: string;
  epoch: string;
  cursor: number;
  lastPull: number;
  lastPush: number;
}

export interface OutboxItem {
  id: string;
  userId: string;
  type: 'create' | 'update' | 'delete';
  entityType: 'transaction';
  entityId: string;
  payload: Record<string, unknown>;
  version?: number;
  createdAt: number;
}

export class FinanceDB extends Dexie {
  transactions!: Table<LocalTransaction>;
  categories!: Table<LocalCategory>;
  budgets!: Table<LocalBudget>;
  syncMeta!: Table<SyncMeta>;
  outbox!: Table<OutboxItem>;

  constructor() {
    super('finance-pwa-db');
    this.version(1).stores({
      transactions: 'id, userId, occurredOn, kind, currency',
      categories: 'id, userId, kind',
      budgets: 'id, userId, periodMonth, currency'
    });

    this.version(2).stores({
      transactions: 'id, userId, occurredOn, kind, currency, synced, pendingOp, localVersion',
      categories: 'id, userId, kind, synced',
      budgets: 'id, userId, periodMonth, currency, synced',
      syncMeta: 'id',
      outbox: 'id, userId, entityType, entityId, createdAt'
    }).upgrade(async (transaction) => {
      await Promise.all(['syncMeta', 'outbox']
        .map((name) => transaction.table(name).clear()));
    });

    this.transactions.hook('creating', (_id, row) => {
      row.localVersion = 1;
      row.synced = false;
      row.pendingOp = 'create';
    });

    this.transactions.hook('updating', (changes, _id, row) => {
      const updates = changes as Partial<LocalTransaction>;
      updates.localVersion = (row.localVersion || 0) + 1;
      if (!row.synced && updates.synced !== true) updates.pendingOp = 'update';
    });
  }
}

export const db = new FinanceDB();

export async function getUserTransactions(userId: string): Promise<LocalTransaction[]> {
  return db.transactions.where('userId').equals(userId).reverse().sortBy('occurredOn');
}

export async function getUserCategories(userId: string): Promise<LocalCategory[]> {
  return db.categories.where('userId').equals(userId).toArray();
}

export async function getUserBudgets(userId: string, periodMonth: string): Promise<LocalBudget[]> {
  return db.budgets.where({ userId, periodMonth }).toArray();
}

export async function getSyncMeta(): Promise<SyncMeta | undefined> {
  return db.syncMeta.get('sync-meta');
}

export async function setSyncMeta(meta: Omit<SyncMeta, 'id'>): Promise<void> {
  await db.syncMeta.put({ id: 'sync-meta', ...meta });
}

export async function addToOutbox(
  item: Omit<OutboxItem, 'id' | 'createdAt'>
): Promise<void> {
  await db.outbox.add({ ...item, id: crypto.randomUUID(), createdAt: Date.now() });
}

export async function getPendingOutbox(userId: string): Promise<OutboxItem[]> {
  return db.outbox.where('userId').equals(userId).sortBy('createdAt');
}

export async function getUserOutboxCount(userId: string): Promise<number> {
  return db.outbox.where('userId').equals(userId).count();
}

export async function getLocalUserIds(): Promise<string[]> {
  const [transactions, categories, budgets, outbox, syncMeta] = await Promise.all([
    db.transactions.orderBy('userId').uniqueKeys(),
    db.categories.orderBy('userId').uniqueKeys(),
    db.budgets.orderBy('userId').uniqueKeys(),
    db.outbox.orderBy('userId').uniqueKeys(),
    db.syncMeta.toArray()
  ]);
  return Array.from(new Set([
    ...transactions, ...categories, ...budgets, ...outbox, ...syncMeta.map((meta) => meta.userId)
  ].filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)));
}

export async function markOutboxDone(ids: string[]): Promise<void> {
  await db.outbox.where('id').anyOf(ids).delete();
}

export async function discardUserOutbox(userId: string): Promise<void> {
  await db.transaction('rw', [db.transactions, db.outbox], async () => {
    await db.outbox.where('userId').equals(userId).delete();
    await db.transactions.where('userId').equals(userId).filter((row) => !row.synced).delete();
  });
}

export async function clearUserData(userId: string): Promise<void> {
  await db.transaction('rw', [db.transactions, db.categories, db.budgets, db.syncMeta, db.outbox], async () => {
    await db.transactions.where('userId').equals(userId).delete();
    await db.categories.where('userId').equals(userId).delete();
    await db.budgets.where('userId').equals(userId).delete();
    await db.outbox.where('userId').equals(userId).delete();
    const meta = await db.syncMeta.get('sync-meta');
    if (meta?.userId === userId) await db.syncMeta.delete('sync-meta');
  });
}

export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persisted' | 'persist'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage
): Promise<boolean> {
  if (!storage) return false;
  try {
    return (await storage.persisted()) || await storage.persist();
  } catch {
    return false;
  }
}
