// Application: Sync engine
import type { Env } from '@env';
import { assertSyncItemsOwnedBy } from './ownership';
import { getDefaultAccountId } from '../accounts/accounts';

export interface SyncPushResult {
  applied: number;
  conflicts: Array<{ id: string; error: string }>;
  newCursor: number;
}

export interface SyncPushItem {
  id: string;
  operationId: string;
  userId: string;
  type: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  version?: number;
}

export interface SyncPullResponse {
  epoch: string;
  sequence: number;
  transactions: any[];
  tombstones: Array<{ id: string; deletedAt: number }>;
  hasMore: boolean;
}

export async function pushSync(
  env: Env,
  userId: string,
  items: SyncPushItem[]
): Promise<SyncPushResult> {
  assertSyncItemsOwnedBy(items, userId);

  let applied = 0;
  const conflicts: Array<{ id: string; error: string }> = [];
  
  for (const item of items) {
    const operationId = item.operationId;
    const requestHash = await hashOperation(item);
    const previous = await getOperation(env, userId, operationId);
    if (previous) {
      if (previous.request_hash !== requestHash) {
        conflicts.push({ id: item.id, error: 'SYNC_OPERATION_ID_REUSED' });
      } else if (previous.result === 'applied') {
        try {
          if (item.type === 'delete') await writeDeletionJournalForTransaction(env, userId, item.id);
          applied++;
        } catch {
          conflicts.push({ id: item.id, error: 'MARKER_FAILED' });
        }
      } else {
        conflicts.push({ id: item.id, error: previous.error_code ?? 'CONFLICT' });
      }
      continue;
    }

    try {
      const operation = { operationId, requestHash };
      if (item.type === 'create') {
        await createTransactionFromSync(env, userId, item, operation);
      } else if (item.type === 'update') {
        await updateTransactionFromSync(env, userId, item, operation);
      } else if (item.type === 'delete') {
        await deleteTransactionFromSync(env, userId, item, operation);
      }
      applied++;
    } catch (e: any) {
      const errorCode = String(e?.message ?? 'SYNC_FAILED');
      if (isDeterministicConflict(errorCode)) {
        await recordOperation(env, userId, item.id, operationId, requestHash, 'conflict', errorCode);
      }

      const afterError = await getOperation(env, userId, operationId);
      if (afterError?.request_hash === requestHash && afterError.result === 'applied') {
        try {
          if (item.type === 'delete') await writeDeletionJournalForTransaction(env, userId, item.id);
          applied++;
        } catch {
          conflicts.push({ id: item.id, error: 'MARKER_FAILED' });
        }
      } else if (afterError && afterError.request_hash !== requestHash) {
        conflicts.push({ id: item.id, error: 'SYNC_OPERATION_ID_REUSED' });
      } else {
        conflicts.push({ id: item.id, error: afterError?.error_code ?? errorCode });
      }
    }
  }
  
  const syncState = await env.DB.prepare(`
    SELECT sequence FROM user_sync_state WHERE user_id = ?
  `).bind(userId).first<{ sequence: number }>();
  
  return { applied, conflicts, newCursor: syncState?.sequence || 0 };
}

type OperationContext = { operationId: string; requestHash: string };
type StoredOperation = { request_hash: string; result: 'applied' | 'conflict'; error_code: string | null };

async function getOperation(env: Env, userId: string, operationId: string): Promise<StoredOperation | null> {
  return env.DB.prepare(`
    SELECT request_hash, result, error_code FROM sync_operations WHERE user_id = ? AND operation_id = ?
  `).bind(userId, operationId).first<StoredOperation>();
}

async function recordOperation(
  env: Env,
  userId: string,
  entityId: string,
  operationId: string,
  requestHash: string,
  result: 'applied' | 'conflict',
  errorCode: string | null = null
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO sync_operations (user_id, operation_id, entity_id, request_hash, result, error_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, operation_id) DO NOTHING
  `).bind(userId, operationId, entityId, requestHash, result, errorCode, Date.now()).run();
}

function operationStatement(
  env: Env,
  userId: string,
  entityId: string,
  operation: OperationContext
) {
  return env.DB.prepare(`
    INSERT INTO sync_operations (user_id, operation_id, entity_id, request_hash, result, error_code, created_at)
    SELECT ?, ?, ?, ?, 'applied', NULL, ? WHERE changes() = 1
  `).bind(userId, operation.operationId, entityId, operation.requestHash, Date.now());
}

async function hashOperation(item: SyncPushItem): Promise<string> {
  const stableJson = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  };

  const content = stableJson({ id: item.id, type: item.type, payload: item.payload, version: item.version ?? null });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isDeterministicConflict(errorCode: string): boolean {
  return errorCode === 'CONFLICT' || errorCode === 'NOT_FOUND' || errorCode === 'DELETED' ||
    errorCode === 'ALREADY_DELETED' || errorCode === 'SYNC_USER_MISMATCH' ||
    errorCode === 'SYNC_OPERATION_ID_REUSED' || errorCode === 'Categoría no encontrada';
}

async function createTransactionFromSync(env: Env, userId: string, item: SyncPushItem, operation: OperationContext) {
  const { payload } = item;
  if (payload.id !== item.id) throw new Error('SYNC_ITEM_ID_MISMATCH');
  const existing = await env.DB.prepare(`
    SELECT id, amount_minor, currency_code, category_id, account_id, occurred_on, note, kind
    FROM transactions WHERE id = ? AND user_id = ?
  `).bind(payload.id, userId).first();
  
  if (existing) {
    const matches = existing.amount_minor === payload.amountMinor &&
      existing.currency_code === payload.currency &&
      existing.category_id === payload.categoryId &&
      (payload.accountId ? existing.account_id === payload.accountId : true) &&
      existing.occurred_on === payload.occurredOn &&
      existing.note === (payload.note || null) &&
      existing.kind === payload.kind;
    
    if (!matches) {
      throw new Error('CONFLICT');
    }
    await recordOperation(env, userId, item.id, operation.operationId, operation.requestHash, 'applied');
    return;
  }
  
  const category = await env.DB.prepare(`
    SELECT id FROM categories WHERE id = ? AND user_id = ? AND archived_at IS NULL
  `).bind(payload.categoryId, userId).first();
  
  if (!category) throw new Error('Categoría no encontrada');

  const accountId = payload.accountId ?? await getDefaultAccountId(env, userId);
  if (!accountId) throw new Error('Cuenta no encontrada');

  const account = await env.DB.prepare(`
    SELECT id FROM accounts WHERE id = ? AND user_id = ? AND archived_at IS NULL
  `).bind(accountId, userId).first();

  if (!account) throw new Error('Cuenta no encontrada');
  
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO transactions (id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?), ?, ?)
    `).bind(payload.id, userId, payload.categoryId, accountId, payload.kind, payload.amountMinor, payload.currency, payload.occurredOn, payload.note || null, userId, payload.createdAt || Date.now(), payload.updatedAt || Date.now()),
    env.DB.prepare(`UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? AND changes() = 1`).bind(userId),
    operationStatement(env, userId, item.id, operation)
  ]);
}

async function updateTransactionFromSync(env: Env, userId: string, item: SyncPushItem, operation: OperationContext) {
  const { payload, version } = item;
  if (payload.id !== item.id) throw new Error('SYNC_ITEM_ID_MISMATCH');
  const now = Date.now();
  
  const setParts: string[] = [
    'version = version + 1',
    'change_seq = (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?)',
    'updated_at = ?'
  ];
  const bindings: any[] = [userId, now];
  
  if (payload.kind) { setParts.push('kind = ?'); bindings.push(payload.kind); }
  if (payload.amountMinor) { setParts.push('amount_minor = ?'); bindings.push(payload.amountMinor); }
  if (payload.currency) { setParts.push('currency_code = ?'); bindings.push(payload.currency); }
  if (payload.categoryId) { setParts.push('category_id = ?'); bindings.push(payload.categoryId); }
  if (payload.accountId) { setParts.push('account_id = ?'); bindings.push(payload.accountId); }
  if (payload.occurredOn) { setParts.push('occurred_on = ?'); bindings.push(payload.occurredOn); }
  if (payload.note !== undefined) { setParts.push('note = ?'); bindings.push(payload.note); }
  
  bindings.push(payload.id, userId, version);
  
  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE transactions
      SET ${setParts.join(', ')}
      WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL
    `).bind(...bindings),
    env.DB.prepare(`UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? AND changes() = 1`).bind(userId),
    operationStatement(env, userId, payload.id as string, operation)
  ]);
  
  if (result[0]?.meta.changes === 0) {
    const existing = await env.DB.prepare(`
      SELECT id, version, deleted_at FROM transactions WHERE id = ? AND user_id = ?
    `).bind(payload.id, userId).first();
    
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.deleted_at) throw new Error('DELETED');
    throw new Error('CONFLICT');
  }
}

async function deleteTransactionFromSync(env: Env, userId: string, item: SyncPushItem, operation: OperationContext) {
  const { payload, version } = item;
  if (payload.id !== item.id) throw new Error('SYNC_ITEM_ID_MISMATCH');
  const now = Date.now();
  
  const markerKey = `deleted-transactions/${userId}/${payload.id}`;
  const marker = JSON.stringify({ id: payload.id, userId, deletedAt: now, type: 'transaction' });
  
  try {
    await env.DELETION_JOURNAL.put(markerKey, marker);
  } catch {
    throw new Error('MARKER_FAILED');
  }
  
  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE transactions
      SET deleted_at = ?, version = version + 1,
          change_seq = (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?),
          updated_at = ?
      WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL
    `).bind(now, userId, now, payload.id, userId, version),
    env.DB.prepare(`UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? AND changes() = 1`).bind(userId),
    operationStatement(env, userId, payload.id as string, operation)
  ]);
  
  if (result[0]?.meta.changes === 0) {
    const existing = await env.DB.prepare(`
      SELECT id, version, deleted_at FROM transactions WHERE id = ? AND user_id = ?
    `).bind(payload.id, userId).first();
    
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.deleted_at) throw new Error('ALREADY_DELETED');
    throw new Error('CONFLICT');
  }

  await writeDeletionJournalForTransaction(env, userId, payload.id as string);
}

async function writeDeletionJournalForTransaction(env: Env, userId: string, transactionId: string): Promise<void> {
  const transaction = await env.DB.prepare(`
    SELECT deleted_at FROM transactions WHERE id = ? AND user_id = ?
  `).bind(transactionId, userId).first<{ deleted_at: number | null }>();
  if (!transaction?.deleted_at) throw new Error('MARKER_FAILED');

  const key = `deleted-transactions/${userId}/${transactionId}`;
  const marker = JSON.stringify({ id: transactionId, userId, deletedAt: transaction.deleted_at, type: 'transaction' });
  const existing = await env.DELETION_JOURNAL.get(key);
  if (existing) {
    const current = await existing.json() as { deletedAt?: number };
    if (current.deletedAt === transaction.deleted_at) return;
  }
  await env.DELETION_JOURNAL.put(key, marker);
}

export async function pullSync(
  env: Env,
  userId: string,
  after: number,
  limit: number
): Promise<{ epoch: string; sequence: number; transactions: any[]; tombstones: Array<{ id: string; deletedAt: number }>; hasMore: boolean }> {
  const syncEpoch = env.SYNC_EPOCH;
  
  const transactions = await env.DB.prepare(`
    SELECT id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at, deleted_at
    FROM transactions
    WHERE user_id = ? AND change_seq > ?
    ORDER BY change_seq ASC
    LIMIT ?
  `).bind(userId, after, limit).all();
  
  const tombstones = await env.DB.prepare(`
    SELECT id, deleted_at
    FROM transactions
    WHERE user_id = ? AND deleted_at IS NOT NULL AND change_seq > ?
    ORDER BY change_seq ASC
    LIMIT ?
  `).bind(userId, after, limit).all();
  
  const syncState = await env.DB.prepare(`
    SELECT sequence FROM user_sync_state WHERE user_id = ?
  `).bind(userId).first<{ sequence: number }>();
  
  return {
    epoch: syncEpoch,
    sequence: syncState?.sequence ?? 0,
    transactions: (transactions.results as any[]).map(mapRowToDto),
    tombstones: (tombstones.results as any[]).map((t) => ({ id: t.id, deletedAt: t.deleted_at })),
    hasMore: transactions.results.length === limit || tombstones.results.length === limit
  };
}

function mapRowToDto(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    accountId: row.account_id ?? null,
    kind: row.kind,
    amountMinor: row.amount_minor,
    currency: row.currency_code,
    occurredOn: row.occurred_on,
    note: row.note ?? undefined,
    version: row.version,
    changeSeq: row.change_seq,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null
  };
}
