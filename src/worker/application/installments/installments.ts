// Application: Installments
import type { Env } from '@env';
import type { InstallmentPlanCreate, InstallmentPlanUpdate } from '@contracts/installment';
import { NotFoundError, ValidationError } from '../../middleware/error-handler';
import { splitInstallmentAmount, installmentDueDate } from '@domain/installment';
import { MAX_MINOR_UNITS } from '@domain/money';
import { todayLocalISO } from '@domain/date';

function mapPlan(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    concept: row.concept,
    totalMinor: row.total_minor,
    currency: row.currency_code,
    installmentsCount: row.installments_count,
    categoryId: row.category_id,
    accountId: row.account_id,
    firstDueOn: row.first_due_on,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at
  };
}

export async function createInstallmentPlan(env: Env, userId: string, data: InstallmentPlanCreate) {
  // Validate category active
  const category = await env.DB.prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ? AND archived_at IS NULL`).bind(data.categoryId, userId).first();
  if (!category) throw new ValidationError('Categoría inválida');
  
  // Guarda de rango financiero (gasto total)
  const flowRow = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_minor ELSE -amount_minor END), 0) AS total FROM transactions WHERE user_id = ? AND currency_code = ? AND deleted_at IS NULL`).bind(userId, data.currency).first<{ total: number }>();
  const projected = (flowRow?.total ?? 0) - data.totalMinor;
  if (Math.abs(projected) > MAX_MINOR_UNITS) throw new ValidationError('El importe excede el rango exacto admitido.');

  let accountId = data.accountId ?? null;
  if (accountId) {
    const acc = await env.DB.prepare(`SELECT id, archived_at FROM accounts WHERE id = ? AND user_id = ?`).bind(accountId, userId).first<any>();
    if (!acc) throw new ValidationError('Cuenta inválida');
    if (acc.archived_at) throw new ValidationError('No se puede usar una cuenta archivada');
  } else {
    const def = await env.DB.prepare(`SELECT id FROM accounts WHERE user_id = ? AND archived_at IS NULL ORDER BY is_default DESC, sort_order ASC LIMIT 1`).bind(userId).first<{ id: string }>();
    accountId = def?.id ?? null;
  }
  
  const amounts = splitInstallmentAmount(data.totalMinor, data.installmentsCount);
  const now = Date.now();
  const planId = crypto.randomUUID();
  
  // Get sync sequence
  const seqRow = await env.DB.prepare(`SELECT sequence FROM user_sync_state WHERE user_id = ?`).bind(userId).first<{ sequence: number }>();
  let baseSeq = seqRow?.sequence ?? 0;
  
  const statements: any[] = [];
  statements.push(env.DB.prepare(`INSERT INTO installment_plans (id, user_id, concept, total_minor, currency_code, installments_count, category_id, account_id, first_due_on, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .bind(planId, userId, data.concept, data.totalMinor, data.currency, data.installmentsCount, data.categoryId, accountId, data.firstDueOn, now, now));
  
  for (let i = 0; i < data.installmentsCount; i++) {
    const itemId = crypto.randomUUID();
    const txId = crypto.randomUUID();
    const dueOn = installmentDueDate(data.firstDueOn, i)!;
    const amountMinor = amounts[i]!;
    const note = `${data.concept} (${i + 1}/${data.installmentsCount})`;
    baseSeq += 1;
    statements.push(env.DB.prepare(`INSERT INTO transactions (id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at, source_type, source_id) VALUES (?, ?, ?, ?, 'expense', ?, ?, ?, ?, 1, ?, ?, ?, 'installment', ?)`)
      .bind(txId, userId, data.categoryId, accountId, amountMinor, data.currency, dueOn, note, baseSeq, now, now, itemId));
    statements.push(env.DB.prepare(`INSERT INTO installment_items (id, plan_id, user_id, installment_number, due_on, amount_minor, currency_code, transaction_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)`)
      .bind(itemId, planId, userId, i + 1, dueOn, amountMinor, data.currency, txId, now, now));
  }
  statements.push(env.DB.prepare(`UPDATE user_sync_state SET sequence = ? WHERE user_id = ?`).bind(baseSeq, userId));
  
  await env.DB.batch(statements);
  
  const plan = await env.DB.prepare(`SELECT * FROM installment_plans WHERE id = ? AND user_id = ?`).bind(planId, userId).first<any>();
  const items = await env.DB.prepare(`SELECT * FROM installment_items WHERE plan_id = ? ORDER BY installment_number`).bind(planId).all<any>();
  return { ...mapPlan(plan), items: items.results.map((r: any) => ({ id: r.id, planId: r.plan_id, installmentNumber: r.installment_number, dueOn: r.due_on, amountMinor: r.amount_minor, currency: r.currency_code, transactionId: r.transaction_id, status: r.status })) };
}

export async function listInstallmentPlans(env: Env, userId: string) {
  const rows = await env.DB.prepare(`SELECT * FROM installment_plans WHERE user_id = ? AND cancelled_at IS NULL ORDER BY created_at DESC`).bind(userId).all<any>();
  return (rows.results as any[]).map(mapPlan);
}

export async function cancelInstallmentPlan(env: Env, userId: string, id: string, version: number) {
  const plan = await env.DB.prepare(`SELECT * FROM installment_plans WHERE id = ? AND user_id = ? AND version = ?`).bind(id, userId, version).first<any>();
  if (!plan) throw new NotFoundError('Plan no encontrado');
  const now = Date.now();
  await env.DB.prepare(`UPDATE installment_plans SET cancelled_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).bind(now, now, id, userId).run();
  const items = await env.DB.prepare(`SELECT * FROM installment_items WHERE plan_id = ? AND status = 'posted' AND due_on > ?`).bind(id, todayLocalISO()).all<any>();
  const seqRow = await env.DB.prepare(`SELECT sequence FROM user_sync_state WHERE user_id = ?`).bind(userId).first<{ sequence: number }>();
  let baseSeq = seqRow?.sequence ?? 0;
  const stmts: any[] = [];
  for (const it of items.results as any[]) {
    baseSeq += 1;
    stmts.push(env.DB.prepare(`UPDATE transactions SET deleted_at = ?, version = version + 1, change_seq = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).bind(now, baseSeq, now, it.transaction_id, userId));
    stmts.push(env.DB.prepare(`UPDATE installment_items SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(now, it.id));
  }
  if (items.results.length > 0) {
    stmts.push(env.DB.prepare(`UPDATE user_sync_state SET sequence = ? WHERE user_id = ?`).bind(baseSeq, userId));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { success: true };
}

export async function updateInstallmentItem(env: Env, userId: string, itemId: string, data: { amountMinor?: number; occurredOn?: string; note?: string | null; version: number }) {
  const item = await env.DB.prepare(`SELECT * FROM installment_items WHERE id = ? AND user_id = ?`).bind(itemId, userId).first<any>();
  if (!item) throw new NotFoundError('Cuota no encontrada');
  if (item.status !== 'posted') throw new ValidationError('La cuota no está disponible');
  if (item.due_on <= todayLocalISO()) throw new ValidationError('Las cuotas vencidas no se pueden editar');
  const tx = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).bind(item.transaction_id, userId).first<any>();
  if (!tx) throw new NotFoundError('Movimiento no encontrado');
  if (tx.version !== data.version) throw new Error('CONFLICT');
  const now = Date.now();
  const setParts: string[] = ['version = version + 1', 'change_seq = (SELECT sequence + 1 FROM user_sync_state WHERE user_id = ?)', 'updated_at = ?'];
  const bindings: any[] = [userId, now];
  if (data.amountMinor !== undefined && data.amountMinor !== tx.amount_minor) {
    const flowRow = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_minor ELSE -amount_minor END), 0) AS total FROM transactions WHERE user_id = ? AND currency_code = ? AND deleted_at IS NULL AND id != ?`).bind(userId, tx.currency_code, item.transaction_id).first<{ total: number }>();
    const projected = (flowRow?.total ?? 0) - (data.amountMinor - tx.amount_minor);
    if (Math.abs(projected) > MAX_MINOR_UNITS) throw new ValidationError('El importe excede el rango exacto admitido.');
    setParts.push('amount_minor = ?'); bindings.push(data.amountMinor);
  }
  if (data.occurredOn !== undefined) {
    if (data.occurredOn <= todayLocalISO()) throw new ValidationError('La fecha debe ser futura');
    setParts.push('occurred_on = ?'); bindings.push(data.occurredOn);
  }
  if (data.note !== undefined) { setParts.push('note = ?'); bindings.push(data.note); }
  bindings.push(item.transaction_id, userId, data.version);
  const stmt1 = env.DB.prepare(`UPDATE transactions SET ${setParts.join(', ')} WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL`).bind(...bindings);
  const r1 = await stmt1.run();
  if ((r1.meta?.changes ?? 0) === 0) throw new Error('CONFLICT');
  await env.DB.prepare(`UPDATE user_sync_state SET sequence = sequence + 1 WHERE user_id = ?`).bind(userId).run();
  const itemUpdates: string[] = ['updated_at = ?'];
  const itemBindings: any[] = [now];
  if (data.amountMinor !== undefined) { itemUpdates.push('amount_minor = ?'); itemBindings.push(data.amountMinor); }
  if (data.occurredOn !== undefined) { itemUpdates.push('due_on = ?'); itemBindings.push(data.occurredOn); }
  itemBindings.push(itemId, userId);
  await env.DB.prepare(`UPDATE installment_items SET ${itemUpdates.join(', ')} WHERE id = ? AND user_id = ?`).bind(...itemBindings).run();
  const updatedTx = await env.DB.prepare(`SELECT id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at, deleted_at, source_type, source_id FROM transactions WHERE id = ? AND user_id = ?`).bind(item.transaction_id, userId).first<any>();
  return {
    id: updatedTx.id,
    userId: updatedTx.user_id,
    categoryId: updatedTx.category_id,
    accountId: updatedTx.account_id,
    kind: updatedTx.kind,
    amountMinor: updatedTx.amount_minor,
    currency: updatedTx.currency_code,
    occurredOn: updatedTx.occurred_on,
    note: updatedTx.note,
    version: updatedTx.version,
    changeSeq: updatedTx.change_seq,
    createdAt: updatedTx.created_at,
    updatedAt: updatedTx.updated_at,
    deletedAt: updatedTx.deleted_at,
    sourceType: updatedTx.source_type,
    sourceId: updatedTx.source_id
  };
}
