// Application: Budgets business logic
import type { Env } from '@env';
import type { BudgetCreate, BudgetUpdate, BudgetWithSpent } from '@contracts/budget';
import { subtractAmounts } from '@domain/money';
import { ValidationError } from '../../middleware/error-handler';

function safeAggregate(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new ValidationError('El total financiero excede el rango exacto admitido.');
  }
  return amount;
}

async function aggregateQuery<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (error instanceof Error && /integer overflow/i.test(error.message)) {
      throw new ValidationError('El total financiero excede el rango exacto admitido.');
    }
    throw error;
  }
}

function mapBudget(b: any): BudgetWithSpent {
  const spent = safeAggregate(b.spent_minor);
  const remaining = subtractAmounts(safeAggregate(b.limit_minor), spent);
  return {
    id: b.id,
    userId: b.user_id,
    categoryId: b.category_id,
    periodMonth: b.period_month,
    currency: b.currency_code,
    limitMinor: b.limit_minor,
    version: b.version,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    spentMinor: spent,
    remainingMinor: remaining,
    isOverBudget: remaining < 0
  } as BudgetWithSpent;
}

async function assertBudgetCategory(env: Env, userId: string, categoryId: string): Promise<void> {
  const category = await env.DB.prepare(`
    SELECT id FROM categories
    WHERE id = ? AND user_id = ? AND kind = 'expense' AND archived_at IS NULL
  `).bind(categoryId, userId).first<{ id: string }>();
  if (!category) throw new ValidationError('La categoría debe estar activa, pertenecer al usuario y ser de gasto.');
}

export async function listBudgets(
  env: Env,
  userId: string,
  periodMonth: string
): Promise<BudgetWithSpent[]> {
  const result = await aggregateQuery(env.DB.prepare(`
    SELECT b.id, b.user_id, b.category_id, b.period_month, b.currency_code, b.limit_minor, b.version, b.created_at, b.updated_at,
           COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_minor ELSE 0 END), 0) as spent_minor
    FROM budgets b
    LEFT JOIN transactions t ON t.user_id = b.user_id 
      AND t.category_id = b.category_id 
      AND t.currency_code = b.currency_code
      AND t.occurred_on LIKE b.period_month || '%'
      AND t.kind = 'expense'
      AND t.deleted_at IS NULL
    WHERE b.user_id = ? AND b.period_month = ?
    GROUP BY b.id
    ORDER BY b.created_at
  `).bind(userId, periodMonth).all());
  
  return (result.results as any[]).map(mapBudget);
}

export async function upsertBudget(
  env: Env,
  userId: string,
  data: BudgetCreate
): Promise<any> {
  const now = Date.now();
  
  await assertBudgetCategory(env, userId, data.categoryId);
  
  const existing = await env.DB.prepare(`
    SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND period_month = ? AND currency_code = ?
  `).bind(userId, data.categoryId, data.periodMonth, data.currency).first<{ id: string }>();
  
  if (existing) {
    await env.DB.prepare(`
      UPDATE budgets SET limit_minor = ?, version = version + 1, updated_at = ?
      WHERE id = ?
    `).bind(data.limitMinor, now, existing.id).run();
    
    const row = await getBudgetWithSpent(env, userId, existing.id);
    if (!row) throw new Error('BUDGET_NOT_FOUND');
    return mapBudget(row as BudgetWithSpent);
  } else {
    await env.DB.prepare(`
      INSERT INTO budgets (id, user_id, category_id, period_month, currency_code, limit_minor, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(data.id, userId, data.categoryId, data.periodMonth, data.currency, data.limitMinor, now, now).run();
    
    const created = await getBudgetWithSpent(env, userId, data.id);
    if (!created) throw new Error('BUDGET_NOT_FOUND');
    return mapBudget(created as BudgetWithSpent);
  }
}

export async function updateBudget(
  env: Env,
  userId: string,
  data: BudgetUpdate
): Promise<any> {
  const { id, version, ...updates } = data;
  if (!id) throw new Error('ID de presupuesto requerido para actualizar');
  const now = Date.now();
  const current = await env.DB.prepare(`
    SELECT category_id FROM budgets WHERE id = ? AND user_id = ?
  `).bind(id, userId).first<{ category_id: string }>();
  if (!current) throw new Error('NOT_FOUND');
  if (updates.categoryId !== undefined && updates.categoryId !== current.category_id) {
    await assertBudgetCategory(env, userId, updates.categoryId);
  }
  
  const setParts: string[] = ['version = version + 1', 'updated_at = ?'];
  const bindings: any[] = [now];
  
  if (updates.limitMinor !== undefined) { setParts.push('limit_minor = ?'); bindings.push(updates.limitMinor); }
  if (updates.categoryId !== undefined) { setParts.push('category_id = ?'); bindings.push(updates.categoryId); }
  if (updates.periodMonth !== undefined) { setParts.push('period_month = ?'); bindings.push(updates.periodMonth); }
  if (updates.currency !== undefined) { setParts.push('currency_code = ?'); bindings.push(updates.currency); }
  
  bindings.push(id, userId, version);
  
  const result = await env.DB.prepare(`
    UPDATE budgets 
    SET ${setParts.join(', ')}
    WHERE id = ? AND user_id = ? AND version = ?
  `).bind(...bindings).run();
  
  if (result.meta.changes === 0) {
    const existing = await env.DB.prepare(`
      SELECT id FROM budgets WHERE id = ? AND user_id = ?
    `).bind(id, userId).first<{ id: string }>();
    
    if (!existing) throw new Error('NOT_FOUND');
    throw new Error('CONFLICT');
  }
  
  const updatedRow = await getBudgetWithSpent(env, userId, id);
  if (!updatedRow) throw new Error('BUDGET_NOT_FOUND');
  return mapBudget(updatedRow!);
}

export async function getBudgetWithSpent(
  env: Env,
  userId: string,
  budgetId: string
): Promise<BudgetWithSpent | null> {
  const row = await aggregateQuery(env.DB.prepare(`
    SELECT b.*, 
           COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_minor ELSE 0 END), 0) as spent_minor
    FROM budgets b
    LEFT JOIN transactions t ON t.user_id = b.user_id 
      AND t.category_id = b.category_id 
      AND t.currency_code = b.currency_code
      AND t.occurred_on LIKE b.period_month || '%'
      AND t.kind = 'expense'
      AND t.deleted_at IS NULL
    WHERE b.id = ? AND b.user_id = ?
    GROUP BY b.id
  `).bind(budgetId, userId).first<{ 
    id: string; user_id: string; category_id: string; period_month: string; 
    currency_code: 'ARS' | 'USD'; limit_minor: number; version: number; 
    created_at: number; updated_at: number; spent_minor: number 
  }>());
  if (!row) return null;
  safeAggregate(row.spent_minor);
  safeAggregate(row.limit_minor);
  return mapBudget(row);
}
export async function deleteBudget(env: Env, userId: string, id: string, version: number) {
  const result = await env.DB.prepare(`
    DELETE FROM budgets WHERE id = ? AND user_id = ? AND version = ?
  `).bind(id, userId, version).run();

  if (result.meta.changes === 0) {
    throw new Error('NOT_FOUND');
  }

  return { success: true };
}
