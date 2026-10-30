// Application: Budgets business logic
import type { Env } from '@env';
import type { BudgetCreate, BudgetUpdate, BudgetWithSpent } from '@contracts/budget';

function mapBudget(b: any): BudgetWithSpent {
  const spent = b.spent_minor ?? 0;
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
    remainingMinor: b.limit_minor - spent,
    isOverBudget: b.limit_minor - spent < 0
  } as BudgetWithSpent;
}

export async function listBudgets(
  env: Env,
  userId: string,
  periodMonth: string
): Promise<BudgetWithSpent[]> {
  const result = await env.DB.prepare(`
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
  `).bind(userId, periodMonth).all();
  
  return (result.results as any[]).map(mapBudget);
}

export async function upsertBudget(
  env: Env,
  userId: string,
  data: BudgetCreate
): Promise<any> {
  const now = Date.now();
  
  const category = await env.DB.prepare(`
    SELECT id FROM categories WHERE id = ? AND user_id = ? AND kind = 'expense' AND archived_at IS NULL
  `).bind(data.categoryId, userId).first();
  
  if (!category) {
    throw new Error('Categoría no encontrada o no es de gasto');
  }
  
  const existing = await env.DB.prepare(`
    SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND period_month = ? AND currency_code = ?
  `).bind(userId, data.categoryId, data.periodMonth, data.currency).first();
  
  if (existing) {
    await env.DB.prepare(`
      UPDATE budgets SET limit_minor = ?, version = version + 1, updated_at = ?
      WHERE id = ?
    `).bind(data.limitMinor, now, existing.id).run();
    
    const row = await env.DB.prepare(`SELECT * FROM budgets WHERE id = ?`).bind(existing.id).first();
    return mapBudget({ ...(row as any), spent_minor: 0 });
  } else {
    await env.DB.prepare(`
      INSERT INTO budgets (id, user_id, category_id, period_month, currency_code, limit_minor, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(data.id, userId, data.categoryId, data.periodMonth, data.currency, data.limitMinor, now, now).run();
    
    const created = await env.DB.prepare(`SELECT * FROM budgets WHERE id = ?`).bind(data.id).first();
    return mapBudget({ ...(created as any), spent_minor: 0 });
  }
}

export async function updateBudget(
  env: Env,
  userId: string,
  data: BudgetUpdate
): Promise<any> {
  const { id, version, ...updates } = data;
  const now = Date.now();
  
  const setParts: string[] = ['version = version + 1', 'updated_at = ?'];
  const bindings: any[] = [now];
  
  if (updates.limitMinor) { setParts.push('limit_minor = ?'); bindings.push(updates.limitMinor); }
  if (updates.categoryId) { setParts.push('category_id = ?'); bindings.push(updates.categoryId); }
  if (updates.periodMonth) { setParts.push('period_month = ?'); bindings.push(updates.periodMonth); }
  if (updates.currency) { setParts.push('currency_code = ?'); bindings.push(updates.currency); }
  
  bindings.push(id, userId, version);
  
  const result = await env.DB.prepare(`
    UPDATE budgets 
    SET ${setParts.join(', ')}
    WHERE id = ? AND user_id = ? AND version = ?
  `).bind(...bindings).run();
  
  if (result.meta.changes === 0) {
    const existing = await env.DB.prepare(`
      SELECT id FROM budgets WHERE id = ? AND user_id = ?
    `).bind(id, userId).first();
    
    if (!existing) throw new Error('NOT_FOUND');
    throw new Error('CONFLICT');
  }
  
  const updatedRow = await env.DB.prepare(`SELECT * FROM budgets WHERE id = ?`).bind(id).first();
  return mapBudget({ ...(updatedRow as any), spent_minor: 0 });
}

export async function getBudgetWithSpent(
  env: Env,
  userId: string,
  budgetId: string
): Promise<any> {
  return env.DB.prepare(`
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
  `).bind(budgetId, userId).first();
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
