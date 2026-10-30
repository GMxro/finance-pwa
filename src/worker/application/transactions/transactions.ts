// Application: Transactions business logic
import type { Env } from '@env';
import type { TransactionCreate, TransactionUpdate, TransactionResponse } from '@contracts/transaction';
import { getDefaultAccountId } from '../accounts/accounts';
import { ValidationError } from '../../middleware/error-handler';

function mapTransaction(row: any): TransactionResponse {
  if (!row) throw new Error('NOT_FOUND');
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
  } as TransactionResponse;
}

export async function listTransactions(
  env: Env,
  userId: string,
  params: { period?: string; currency?: string; kind?: string; categoryId?: string; page: number; limit: number }
): Promise<TransactionResponse[]> {
  const conditions: string[] = ['user_id = ?', 'deleted_at IS NULL'];
  const bindings: any[] = [userId];
  
  if (params.period) {
    conditions.push('occurred_on LIKE ?');
    bindings.push(`${params.period}%`);
  }
  if (params.currency) {
    conditions.push('currency_code = ?');
    bindings.push(params.currency);
  }
  if (params.kind) {
    conditions.push('kind = ?');
    bindings.push(params.kind);
  }
  if (params.categoryId) {
    conditions.push('category_id = ?');
    bindings.push(params.categoryId);
  }
  
  const whereClause = conditions.join(' AND ');
  const offset = (params.page - 1) * params.limit;
  
  const result = await env.DB.prepare(`
    SELECT id, user_id, category_id, account_id, kind, amount_minor, currency_code, 
           occurred_on, note, version, change_seq, created_at, updated_at, deleted_at
    FROM transactions
    WHERE ${whereClause}
    ORDER BY occurred_on DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, params.limit, offset).all();
  
  return (result.results as any[]).map(mapTransaction);
}

export async function createTransaction(
  env: Env,
  userId: string,
  data: TransactionCreate
): Promise<TransactionResponse> {
  const now = Date.now();
  const changeSeq = await getNextSequence(env, userId);
  
  const category = await env.DB.prepare(`
    SELECT id FROM categories WHERE id = ? AND user_id = ? AND archived_at IS NULL
  `).bind(data.categoryId, userId).first();
  
  if (!category) {
    throw new Error('Categoría no encontrada');
  }

  const accountId = data.accountId ?? await getDefaultAccountId(env, userId);
  if (!accountId) {
    throw new ValidationError('Creá una cuenta antes de registrar movimientos.');
  }

  const account = await env.DB.prepare(`
    SELECT id FROM accounts WHERE id = ? AND user_id = ? AND archived_at IS NULL
  `).bind(accountId, userId).first();

  if (!account) {
    throw new ValidationError('La cuenta elegida no existe o está archivada.');
  }

  const stmt1 = env.DB.prepare(`
    INSERT INTO transactions (id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).bind(data.id, userId, data.categoryId, accountId, data.kind, data.amountMinor, data.currency, data.occurredOn, data.note || null, changeSeq, now, now);
  
  const stmt2 = env.DB.prepare(`
    UPDATE user_sync_state SET sequence = ? WHERE user_id = ?
  `).bind(changeSeq, userId);
  
  await env.DB.batch([stmt1, stmt2]);
  
  const tx = await env.DB.prepare(`
    SELECT id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at, deleted_at
    FROM transactions WHERE id = ? AND user_id = ?
  `).bind(data.id, userId).first<TransactionResponse>();
  
  if (!tx) {
    throw new Error('Error al crear la transacción');
  }
  
  return mapTransaction(tx);
}

export async function updateTransaction(
  env: Env,
  userId: string,
  data: TransactionUpdate
): Promise<TransactionResponse> {
  const { id, version, ...updates } = data;
  const now = Date.now();
  const changeSeq = await getNextSequence(env, userId);
  
  const setParts: string[] = ['version = version + 1', 'change_seq = ?', 'updated_at = ?'];
  const bindings: any[] = [changeSeq, now];
  
  if (updates.kind) { setParts.push('kind = ?'); bindings.push(updates.kind); }
  if (updates.amountMinor) { setParts.push('amount_minor = ?'); bindings.push(updates.amountMinor); }
  if (updates.currency) { setParts.push('currency_code = ?'); bindings.push(updates.currency); }
  if (updates.categoryId) { setParts.push('category_id = ?'); bindings.push(updates.categoryId); }
  if (updates.accountId) {
    const account = await env.DB.prepare(`
      SELECT id FROM accounts WHERE id = ? AND user_id = ? AND archived_at IS NULL
    `).bind(updates.accountId, userId).first();
    if (!account) throw new ValidationError('La cuenta elegida no existe o está archivada.');
    setParts.push('account_id = ?');
    bindings.push(updates.accountId);
  }
  if (updates.occurredOn) { setParts.push('occurred_on = ?'); bindings.push(updates.occurredOn); }
  if (updates.note !== undefined) { setParts.push('note = ?'); bindings.push(updates.note); }
  
  bindings.push(id, userId, version);
  
  const stmt1 = env.DB.prepare(`
    UPDATE transactions 
    SET ${setParts.join(', ')}
    WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL
  `).bind(...bindings);
  
  const stmt2 = env.DB.prepare(`
    UPDATE user_sync_state SET sequence = ? WHERE user_id = ?
  `).bind(changeSeq, userId);
  
  const results = await env.DB.batch([stmt1, stmt2]);
  
  if (results[0]?.meta.changes === 0) {
    const existing = await env.DB.prepare(`
      SELECT id, version, deleted_at FROM transactions WHERE id = ? AND user_id = ?
    `).bind(id, userId).first<{ id: string; version: number; deleted_at: number | null }>();
    
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    if (existing.deleted_at) {
      throw new Error('DELETED');
    }
    throw new Error('CONFLICT');
  }
  
  const tx = await env.DB.prepare(`
    SELECT id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at, deleted_at
    FROM transactions WHERE id = ? AND user_id = ?
  `).bind(id, userId).first<TransactionResponse>();
  
  if (!tx) {
    throw new Error('Error al actualizar');
  }
  
  return mapTransaction(tx);
}

export async function deleteTransaction(
  env: Env,
  userId: string,
  id: string,
  version: number
): Promise<void> {
  const now = Date.now();
  const changeSeq = await getNextSequence(env, userId);
  
  const markerKey = `deleted-transactions/${userId}/${id}`;
  const marker = JSON.stringify({ id, userId, deletedAt: now, type: 'transaction' });
  
  try {
    await env.DELETION_JOURNAL.put(markerKey, marker);
  } catch (e) {
    console.error('Failed to write deletion marker:', e);
    throw new Error('MARKER_FAILED');
  }
  
  const stmt1 = env.DB.prepare(`
    UPDATE transactions 
    SET deleted_at = ?, version = version + 1, change_seq = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL
  `).bind(now, changeSeq, now, id, userId, version);
  
  const stmt2 = env.DB.prepare(`
    UPDATE user_sync_state SET sequence = ? WHERE user_id = ?
  `).bind(changeSeq, userId);
  
  const results = await env.DB.batch([stmt1, stmt2]);
  
  if (results[0]?.meta.changes === 0) {
    const existing = await env.DB.prepare(`
      SELECT id, version, deleted_at FROM transactions WHERE id = ? AND user_id = ?
    `).bind(id, userId).first<{ id: string; version: number; deleted_at: number | null }>();
    
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.deleted_at) throw new Error('ALREADY_DELETED');
    throw new Error('CONFLICT');
  }
}

async function getNextSequence(env: Env, userId: string): Promise<number> {
  const result = await env.DB.prepare(`
    UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? RETURNING sequence
  `).bind(userId).first<{ sequence: number }>();
  
  return result?.sequence ?? 1;
}
