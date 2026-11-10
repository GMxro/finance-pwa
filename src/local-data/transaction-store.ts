// Local data: offline capture and cache for transactions.
import { db, addToOutbox, getPendingOutbox, type LocalTransaction } from './database';
import type { TransactionResponse } from '@contracts/transaction';

export interface PendingInput {
  id: string;
  userId: string;
  kind: 'income' | 'expense';
  amountMinor: number;
  currency: 'ARS' | 'USD';
  categoryId: string;
  accountId: string;
  occurredOn: string;
  note?: string;
}

/** Persist a movement locally and queue it for later synchronization. */
export async function savePendingCreate(input: PendingInput): Promise<void> {
  const now = Date.now();
  const local: LocalTransaction = {
    id: input.id,
    userId: input.userId,
    categoryId: input.categoryId,
    accountId: input.accountId,
    kind: input.kind,
    amountMinor: input.amountMinor,
    currency: input.currency,
    occurredOn: input.occurredOn,
    note: input.note,
    version: 1,
    changeSeq: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    synced: false,
    pendingOp: 'create',
    localVersion: 1
  };

  await db.transaction('rw', [db.transactions, db.outbox], async () => {
    await db.transactions.put(local);
    await addToOutbox({
      userId: input.userId,
      type: 'create',
      entityType: 'transaction',
      entityId: input.id,
      payload: {
        id: input.id,
        kind: input.kind,
        amountMinor: input.amountMinor,
        currency: input.currency,
        categoryId: input.categoryId,
        accountId: input.accountId,
        occurredOn: input.occurredOn,
        note: input.note ?? null
      }
    });
  });
}

/** Merge cached (possibly pending) rows with a server page. */
export async function mergeWithCache(userId: string, serverRows: TransactionResponse[]): Promise<LocalTransaction[]> {
  const outbox = await getPendingOutbox(userId);
  const pendingIds = new Set(outbox
    .filter((operation) => operation.entityType === 'transaction')
    .map((operation) => operation.entityId));
  const pending = await db.transactions
    .where('userId')
    .equals(userId)
    .filter((t) => !t.synced && !t.deletedAt && pendingIds.has(t.id))
    .toArray();

  const byId = new Map<string, any>();
  for (const row of serverRows) {
    if ((row as any).deletedAt) continue;
    byId.set(row.id, row);
  }
  for (const row of pending) {
    byId.set(row.id, row);
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.occurredOn === b.occurredOn) return a.id < b.id ? 1 : -1;
    return a.occurredOn < b.occurredOn ? 1 : -1;
  });
}

/** Cache a server page so the next offline visit can render it. */
export async function cacheServerRows(userId: string, rows: TransactionResponse[]): Promise<void> {
  if (rows.length === 0) return;
  await db.transaction('rw', [db.transactions], async () => {
    for (const row of rows) {
      const existing = await db.transactions.get(row.id);
      if (existing && !existing.synced) continue; // keep pending local copy
      await db.transactions.put({ ...row, userId, synced: true, localVersion: row.version });
    }
  });
}

/** Read cached rows for offline rendering. */
export async function readCached(userId: string): Promise<LocalTransaction[]> {
  const rows = await db.transactions.where('userId').equals(userId).toArray();
  return rows
    .filter((t) => !t.deletedAt)
    .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
}
