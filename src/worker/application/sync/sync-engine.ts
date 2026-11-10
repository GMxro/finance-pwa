// Application: Sync engine
import type { Env } from '@env';
import { assertSyncItemsOwnedBy } from './ownership';
import { getDefaultAccountId } from '../accounts/accounts';
import { syncBatchItemSchema } from '@contracts/sync';
import { assertTransactionCategory, InvalidTransactionCategoryError } from '../transactions/transactions';
import { ValidationError } from '../../middleware/error-handler';
import { currencyFlowBindings, currencyFlowTotalSql } from '../financial-limit';
import { MAX_MINOR_UNITS } from '@domain/money';

export interface SyncPushResult {
  applied: number;
  appliedOperationIds: string[];
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
  const parsedItems = items.map((item) => syncBatchItemSchema.safeParse(item));
  if (parsedItems.some((result) => !result.success)) throw new Error('SYNC_INVALID_PAYLOAD');
  if (new Set(items.map((item) => item.operationId)).size !== items.length) {
    throw new Error('SYNC_DUPLICATE_OPERATION_ID');
  }
  assertSyncItemsOwnedBy(items, userId);

  let applied = 0;
  const appliedOperationIds: string[] = [];
  const conflicts: Array<{ id: string; error: string }> = [];
  
  for (const item of items) {
    const operationId = item.operationId;
    const requestHash = await hashOperation(item);
    const previous = await getOperation(env, userId, operationId);
    if (previous) {
      if (previous.entity_id !== item.id || previous.request_hash !== requestHash) {
        conflicts.push({ id: item.id, error: 'SYNC_OPERATION_ID_REUSED' });
      } else if (previous.result === 'applied') {
        try {
          if (!(await verifyAppliedResult(env, userId, item))) {
            conflicts.push({ id: item.id, error: 'SYNC_RESULT_MISSING' });
            continue;
          }
          if (item.type === 'delete') await writeDeletionJournalForTransaction(env, userId, item.id);
          applied++;
          appliedOperationIds.push(operationId);
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
      appliedOperationIds.push(operationId);
    } catch (e: any) {
      const errorCode = e instanceof InvalidTransactionCategoryError
        ? 'CATEGORY_INVALID'
        : String(e?.message ?? 'SYNC_FAILED');
      if (isDeterministicConflict(errorCode)) {
        await recordOperation(env, userId, item.id, operationId, requestHash, 'conflict', errorCode);
      }

      const afterError = await getOperation(env, userId, operationId);
      if (afterError?.entity_id === item.id && afterError.request_hash === requestHash && afterError.result === 'applied') {
        try {
          if (!(await verifyAppliedResult(env, userId, item))) {
            conflicts.push({ id: item.id, error: 'SYNC_RESULT_MISSING' });
            continue;
          }
          if (item.type === 'delete') await writeDeletionJournalForTransaction(env, userId, item.id);
          applied++;
          appliedOperationIds.push(operationId);
        } catch {
          conflicts.push({ id: item.id, error: 'MARKER_FAILED' });
        }
      } else if (afterError && (afterError.entity_id !== item.id || afterError.request_hash !== requestHash)) {
        conflicts.push({ id: item.id, error: 'SYNC_OPERATION_ID_REUSED' });
      } else {
        conflicts.push({ id: item.id, error: afterError?.error_code ?? errorCode });
      }
    }
  }
  
  const syncState = await env.DB.prepare(`
    SELECT sequence FROM user_sync_state WHERE user_id = ?
  `).bind(userId).first<{ sequence: number }>();
  
  return { applied, appliedOperationIds, conflicts, newCursor: syncState?.sequence || 0 };
}

type OperationContext = { operationId: string; requestHash: string };
type StoredOperation = { entity_id: string; request_hash: string; result: 'applied' | 'conflict'; error_code: string | null };

async function getOperation(env: Env, userId: string, operationId: string): Promise<StoredOperation | null> {
  return env.DB.prepare(`
    SELECT entity_id, request_hash, result, error_code FROM sync_operations WHERE user_id = ? AND operation_id = ?
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
    INSERT INTO sync_operations (user_id, operation_id, entity_type, entity_id, request_hash, result, error_code, created_at)
    VALUES (?, ?, 'transaction', ?, ?, ?, ?, ?)
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
    INSERT INTO sync_operations (user_id, operation_id, entity_type, entity_id, request_hash, result, error_code, created_at)
    SELECT ?, ?, 'transaction', ?, ?, 'applied', NULL, ? WHERE changes() = 1
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

async function verifyAppliedResult(env: Env, userId: string, item: SyncPushItem): Promise<boolean> {
  if (item.type === 'create') {
    const payload = item.payload;
    const row = await env.DB.prepare(`
      SELECT amount_minor, currency_code, category_id, account_id, occurred_on, note, kind, deleted_at
      FROM transactions WHERE id = ? AND user_id = ?
    `).bind(item.id, userId).first<any>();
    return Boolean(row && !row.deleted_at &&
      row.amount_minor === payload.amountMinor &&
      row.currency_code === payload.currency &&
      row.category_id === payload.categoryId &&
      (payload.accountId === undefined || row.account_id === payload.accountId) &&
      row.occurred_on === payload.occurredOn &&
      row.note === (payload.note || null) &&
      row.kind === payload.kind);
  }
  if (item.type === 'delete') {
    const row = await env.DB.prepare(`
      SELECT deleted_at FROM transactions WHERE id = ? AND user_id = ?
    `).bind(item.id, userId).first<{ deleted_at: number | null }>();
    return Boolean(row?.deleted_at);
  }
  const row = await env.DB.prepare(`
    SELECT version, deleted_at, kind, amount_minor, currency_code, category_id, account_id, occurred_on, note
    FROM transactions WHERE id = ? AND user_id = ?
  `).bind(item.id, userId).first<any>();
  if (!row || row.deleted_at || row.version <= (item.version ?? 0)) return false;
  const payload = item.payload;
  return (payload.kind === undefined || row.kind === payload.kind) &&
    (payload.amountMinor === undefined || row.amount_minor === payload.amountMinor) &&
    (payload.currency === undefined || row.currency_code === payload.currency) &&
    (payload.categoryId === undefined || row.category_id === payload.categoryId) &&
    (payload.accountId === undefined || row.account_id === payload.accountId) &&
    (payload.occurredOn === undefined || row.occurred_on === payload.occurredOn) &&
    (payload.note === undefined || row.note === payload.note);
}

function isDeterministicConflict(errorCode: string): boolean {
  return errorCode === 'CONFLICT' || errorCode === 'NOT_FOUND' || errorCode === 'DELETED' ||
    errorCode === 'ALREADY_DELETED' || errorCode === 'SYNC_USER_MISMATCH' ||
    errorCode === 'SYNC_OPERATION_ID_REUSED' || errorCode === 'CATEGORY_INVALID' ||
    errorCode === 'ACCOUNT_NOT_FOUND';
}

async function createTransactionFromSync(env: Env, userId: string, item: SyncPushItem, operation: OperationContext) {
  const { payload } = item;
  await assertTransactionCategory(env, userId, payload.categoryId as string, payload.kind as 'income' | 'expense');
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
  
  const accountId = payload.accountId ?? await getDefaultAccountId(env, userId);
  if (!accountId) throw new Error('Cuenta no encontrada');

  const account = await env.DB.prepare(`
    SELECT id FROM accounts WHERE id = ? AND user_id = ? AND archived_at IS NULL
  `).bind(accountId, userId).first();

  if (!account) throw new Error('Cuenta no encontrada');
  
  let results: D1Result[];
  try {
    results = await env.DB.batch([
      env.DB.prepare(`
      INSERT INTO transactions (id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?), ?, ?
      WHERE ${currencyFlowTotalSql()} + ? <= ?
      `).bind(
        payload.id, userId, payload.categoryId, accountId, payload.kind, payload.amountMinor, payload.currency,
        payload.occurredOn, payload.note || null, userId, payload.createdAt || Date.now(), payload.updatedAt || Date.now(),
        ...currencyFlowBindings(userId, payload.currency as string), payload.amountMinor, MAX_MINOR_UNITS
      ),
      env.DB.prepare(`UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? AND changes() = 1`).bind(userId),
      operationStatement(env, userId, item.id, operation)
    ]);
  } catch (error) {
    if (error instanceof Error && /integer overflow/i.test(error.message)) throw new Error('FINANCIAL_RANGE_EXCEEDED');
    throw error;
  }
  if (results[0]?.meta.changes === 0) throw new Error('FINANCIAL_RANGE_EXCEEDED');
}

async function updateTransactionFromSync(env: Env, userId: string, item: SyncPushItem, operation: OperationContext) {
  const { payload, version } = item;
  const now = Date.now();

  const current = await env.DB.prepare(`
    SELECT category_id, kind, account_id, amount_minor, currency_code FROM transactions
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(item.id, userId).first<{
    category_id: string; kind: 'income' | 'expense'; account_id: string; amount_minor: number; currency_code: string
  }>();
  if (!current) throw new Error('NOT_FOUND');
  const categoryId = (payload.categoryId as string | undefined) ?? current.category_id;
  const kind = (payload.kind as 'income' | 'expense' | undefined) ?? current.kind;
  if (categoryId !== current.category_id || kind !== current.kind) {
    await assertTransactionCategory(env, userId, categoryId, kind);
  }

  if (payload.accountId !== undefined) {
    const account = await env.DB.prepare(`
      SELECT id FROM accounts WHERE id = ? AND user_id = ? AND archived_at IS NULL
    `).bind(payload.accountId, userId).first();
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
  }
  
  const setParts: string[] = [
    'version = version + 1',
    'change_seq = (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?)',
    'updated_at = ?'
  ];
  const bindings: any[] = [userId, now];
  
  if (payload.kind !== undefined) { setParts.push('kind = ?'); bindings.push(payload.kind); }
  if (payload.amountMinor !== undefined) { setParts.push('amount_minor = ?'); bindings.push(payload.amountMinor); }
  if (payload.currency !== undefined) { setParts.push('currency_code = ?'); bindings.push(payload.currency); }
  if (payload.categoryId !== undefined) { setParts.push('category_id = ?'); bindings.push(payload.categoryId); }
  if (payload.accountId !== undefined) { setParts.push('account_id = ?'); bindings.push(payload.accountId); }
  if (payload.occurredOn !== undefined) { setParts.push('occurred_on = ?'); bindings.push(payload.occurredOn); }
  if (payload.note !== undefined) { setParts.push('note = ?'); bindings.push(payload.note); }
  
  bindings.push(payload.id, userId, version);
  const financialChange = payload.amountMinor !== undefined || payload.currency !== undefined;
  if (financialChange) {
    const currency = (payload.currency as string | undefined) ?? current.currency_code;
    bindings.push(...currencyFlowBindings(userId, currency, item.id), payload.amountMinor ?? current.amount_minor, MAX_MINOR_UNITS);
  }
  const capacity = financialChange ? `AND ${currencyFlowTotalSql(true)} + ? <= ?` : '';
  
  let result: D1Result[];
  try {
    result = await env.DB.batch([
      env.DB.prepare(`
      UPDATE transactions
      SET ${setParts.join(', ')}
      WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL ${capacity}
      `).bind(...bindings),
    env.DB.prepare(`UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? AND changes() = 1`).bind(userId),
    operationStatement(env, userId, payload.id as string, operation)
    ]);
  } catch (error) {
    if (error instanceof Error && /integer overflow/i.test(error.message)) {
      throw new Error('FINANCIAL_RANGE_EXCEEDED');
    }
    throw error;
  }
  
  if (result[0]?.meta.changes === 0) {
    const existing = await env.DB.prepare(`
      SELECT id, version, deleted_at FROM transactions WHERE id = ? AND user_id = ?
    `).bind(payload.id, userId).first();
    
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.deleted_at) throw new Error('DELETED');
    if (existing.version === version) throw new Error('FINANCIAL_RANGE_EXCEEDED');
    throw new Error('CONFLICT');
  }
}

async function deleteTransactionFromSync(env: Env, userId: string, item: SyncPushItem, operation: OperationContext) {
  const { payload, version } = item;
  const now = Date.now();

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
): Promise<{ userId: string; epoch: string; sequence: number; transactions: any[]; tombstones: Array<{ id: string; deletedAt: number }>; hasMore: boolean }> {
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
  const delivered = (transactions.results as any[]).reduce(
    (max, transaction) => Math.max(max, transaction.change_seq), after
  );
  const hasMore = transactions.results.length === limit;

  return {
    userId,
    epoch: syncEpoch,
    sequence: hasMore ? delivered : syncState?.sequence ?? delivered,
    transactions: (transactions.results as any[]).map(mapRowToDto),
    tombstones: (tombstones.results as any[]).map((t) => ({ id: t.id, deletedAt: t.deleted_at })),
    hasMore
  };
}

function mapRowToDto(row: any) {
  const amountMinor = Number(row.amount_minor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new ValidationError('El importe excede el rango exacto admitido.');
  }
  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
      accountId: row.account_id,
    kind: row.kind,
    amountMinor,
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
