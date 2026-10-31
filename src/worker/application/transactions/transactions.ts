// Application: Transactions business logic
import type { Env } from '@env';
import type { TransactionCreate, TransactionUpdate, TransactionResponse } from '@contracts/transaction';
import { getDefaultAccountId } from '../accounts/accounts';
import { ValidationError } from '../../middleware/error-handler';
import { currencyFlowBindings, currencyFlowTotalSql } from '../financial-limit';
import { MAX_MINOR_UNITS } from '@domain/money';

export class InvalidTransactionCategoryError extends ValidationError {
  constructor() {
    super('La categoría no está disponible para este tipo de movimiento.');
    this.name = 'CATEGORY_INVALID';
  }
}

function mapTransaction(row: any): TransactionResponse {
  if (!row) throw new Error('NOT_FOUND');
  const amountMinor = Number(row.amount_minor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new ValidationError('El importe excede el rango exacto admitido.');
  }
  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    accountId: row.account_id ?? null,
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
  } as TransactionResponse;
}

export async function assertTransactionCategory(
  env: Env,
  userId: string,
  categoryId: string,
  kind: 'income' | 'expense'
): Promise<void> {
  const category = await env.DB.prepare(`
    SELECT id FROM categories
    WHERE id = ? AND user_id = ? AND archived_at IS NULL AND kind = ?
  `).bind(categoryId, userId, kind).first();
  if (!category) throw new InvalidTransactionCategoryError();
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
  
  await assertTransactionCategory(env, userId, data.categoryId, data.kind);

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
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?), ?, ?
    WHERE ${currencyFlowTotalSql()} + ? <= ?
  `).bind(
    data.id, userId, data.categoryId, accountId, data.kind, data.amountMinor, data.currency, data.occurredOn,
    data.note || null, userId, now, now,
    ...currencyFlowBindings(userId, data.currency), data.amountMinor, MAX_MINOR_UNITS
  );
  
  const stmt2 = env.DB.prepare(`
    UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? AND changes() = 1
  `).bind(userId);
  
  let results: D1Result[];
  try {
    results = await env.DB.batch([stmt1, stmt2]);
  } catch (error) {
    if (error instanceof Error && /integer overflow/i.test(error.message)) {
      throw new ValidationError('El total financiero excede el rango exacto admitido.');
    }
    throw error;
  }
  if (results[0]?.meta.changes === 0) {
    throw new ValidationError('El total financiero excede el rango exacto admitido.');
  }
  
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

  const current = await env.DB.prepare(`
    SELECT category_id, kind, amount_minor, currency_code FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(id, userId).first<{ category_id: string; kind: 'income' | 'expense'; amount_minor: number; currency_code: string }>();
  if (!current) throw new Error('NOT_FOUND');
  const nextCategoryId = updates.categoryId ?? current.category_id;
  const nextKind = updates.kind ?? current.kind;
  if (nextCategoryId !== current.category_id || nextKind !== current.kind) {
    await assertTransactionCategory(env, userId, nextCategoryId, nextKind);
  }
  
  const setParts: string[] = [
    'version = version + 1',
    'change_seq = (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?)',
    'updated_at = ?'
  ];
  const bindings: any[] = [userId, now];
  
  if (updates.kind !== undefined) { setParts.push('kind = ?'); bindings.push(updates.kind); }
  if (updates.amountMinor !== undefined) { setParts.push('amount_minor = ?'); bindings.push(updates.amountMinor); }
  if (updates.currency !== undefined) { setParts.push('currency_code = ?'); bindings.push(updates.currency); }
  if (updates.categoryId !== undefined) { setParts.push('category_id = ?'); bindings.push(updates.categoryId); }
  if (updates.accountId !== undefined) {
    const account = await env.DB.prepare(`
      SELECT id FROM accounts WHERE id = ? AND user_id = ? AND archived_at IS NULL
    `).bind(updates.accountId, userId).first();
    if (!account) throw new ValidationError('La cuenta elegida no existe o está archivada.');
    setParts.push('account_id = ?');
    bindings.push(updates.accountId);
  }
  if (updates.occurredOn !== undefined) { setParts.push('occurred_on = ?'); bindings.push(updates.occurredOn); }
  if (updates.note !== undefined) { setParts.push('note = ?'); bindings.push(updates.note); }
  
  bindings.push(id, userId, version);
  const financialChange = updates.amountMinor !== undefined || updates.currency !== undefined;
  if (financialChange) {
    const currency = updates.currency ?? current.currency_code;
    bindings.push(...currencyFlowBindings(userId, currency, id), updates.amountMinor ?? current.amount_minor, MAX_MINOR_UNITS);
  }
  
  const capacity = financialChange ? `AND ${currencyFlowTotalSql(true)} + ? <= ?` : '';
  const stmt1 = env.DB.prepare(`
    UPDATE transactions 
    SET ${setParts.join(', ')}
    WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL ${capacity}
  `).bind(...bindings);
  
  const stmt2 = env.DB.prepare(`
    UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? AND changes() = 1
  `).bind(userId);
  
  let results: D1Result[];
  try {
    results = await env.DB.batch([stmt1, stmt2]);
  } catch (error) {
    if (error instanceof Error && /integer overflow/i.test(error.message)) {
      throw new ValidationError('El total financiero excede el rango exacto admitido.');
    }
    throw error;
  }
  
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
    if (existing.version === version) {
      throw new ValidationError('El total financiero excede el rango exacto admitido.');
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

  const stmt1 = env.DB.prepare(`
    UPDATE transactions 
    SET deleted_at = ?, version = version + 1,
        change_seq = (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?), updated_at = ?
    WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL
  `).bind(now, userId, now, id, userId, version);
  
  const stmt2 = env.DB.prepare(`
    UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ? AND changes() = 1
  `).bind(userId);
  
  const results = await env.DB.batch([stmt1, stmt2]);
  
  if (results[0]?.meta.changes === 0) {
    const existing = await env.DB.prepare(`
      SELECT id, version, deleted_at FROM transactions WHERE id = ? AND user_id = ?
    `).bind(id, userId).first<{ id: string; version: number; deleted_at: number | null }>();
    
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.deleted_at) {
      await writeTransactionDeletionMarker(env, userId, id, existing.deleted_at);
      return;
    }
    throw new Error('CONFLICT');
  }

  await writeTransactionDeletionMarker(env, userId, id, now);
}

async function writeTransactionDeletionMarker(env: Env, userId: string, id: string, deletedAt: number): Promise<void> {
  try {
    await env.DELETION_JOURNAL.put(
      `deleted-transactions/${userId}/${id}`,
      JSON.stringify({ id, userId, deletedAt, type: 'transaction' })
    );
  } catch {
    throw new Error('MARKER_FAILED');
  }
}

export async function getMonthlySummary(
  env: Env,
  userId: string,
  periodMonth: string,
  currency?: 'ARS' | 'USD'
): Promise<{
  periodMonth: string;
  currency: 'ARS' | 'USD';
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  byCategory: Array<{ categoryId: string; kind: 'income' | 'expense'; amountMinor: number }>;
  transactionCount: number;
}> {
  const currencies = currency ? [currency] : ['ARS', 'USD'];
  const results: Array<{
    periodMonth: string;
    currency: 'ARS' | 'USD';
    incomeMinor: number;
    expenseMinor: number;
    netMinor: number;
    byCategory: Array<{ categoryId: string; kind: 'income' | 'expense'; amountMinor: number }>;
    transactionCount: number;
  }> = [];
  
  for (const curr of currencies) {
    const incomeResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_minor), 0) as total
      FROM transactions
      WHERE user_id = ? AND currency_code = ? AND kind = 'income'
        AND occurred_on LIKE ? AND deleted_at IS NULL
    `).bind(userId, curr, `${periodMonth}%`).first<{ total: number }>();
    
    const expenseResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_minor), 0) as total
      FROM transactions
      WHERE user_id = ? AND currency_code = ? AND kind = 'expense'
        AND occurred_on LIKE ? AND deleted_at IS NULL
    `).bind(userId, curr, `${periodMonth}%`).first<{ total: number }>();
    
    const categoryResult = await env.DB.prepare(`
      SELECT category_id, kind, COALESCE(SUM(amount_minor), 0) as total
      FROM transactions
      WHERE user_id = ? AND currency_code = ? AND occurred_on LIKE ? AND deleted_at IS NULL
      GROUP BY category_id, kind
    `).bind(userId, curr, `${periodMonth}%`).all<{ category_id: string; kind: 'income' | 'expense'; total: number }>();
    
    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM transactions
      WHERE user_id = ? AND currency_code = ? AND occurred_on LIKE ? AND deleted_at IS NULL
    `).bind(userId, curr, `${periodMonth}%`).first<{ count: number }>();
    
    const byCategory = (categoryResult.results as any[]).map(row => ({
      categoryId: row.category_id,
      kind: row.kind,
      amountMinor: Number(row.total)
    }));
    
results.push({
      periodMonth,
      currency: curr as 'ARS' | 'USD',
     incomeMinor: Number(incomeResult?.total ?? 0),
     expenseMinor: Number(expenseResult?.total ?? 0),
      netMinor: Number(incomeResult?.total ?? 0) - Number(expenseResult?.total ?? 0),
      byCategory,
      transactionCount: Number(countResult?.count ?? 0)
    });
  }
  
  return results[0]!;
  // currencies always has at least one element (ARS or USD), so results is non-empty
}
