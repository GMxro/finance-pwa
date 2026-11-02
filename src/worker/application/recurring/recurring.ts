// Application: Recurring
import type { Env } from '@env';
import type { RecurringRuleCreate, RecurringRuleUpdate } from '@contracts/recurring';
import { NotFoundError, ValidationError } from '../../middleware/error-handler';
import { computeNextDue, validateRecurringRule } from '@domain/recurring';
import { MAX_MINOR_UNITS } from '@domain/money';
import { todayLocalISO } from '@domain/date';

function mapRule(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    concept: row.concept,
    amountMinor: row.amount_minor,
    currency: row.currency_code,
    categoryId: row.category_id,
    accountId: row.account_id,
    frequency: row.frequency,
    dayOfMonth: row.day_of_month,
    daysOfWeek: row.days_of_week,
    monthOfYear: row.month_of_year,
    startOn: row.start_on,
    endOn: row.end_on,
    nextDueOn: row.next_due_on,
    active: row.active === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at
  };
}

export async function createRecurringRule(env: Env, userId: string, data: RecurringRuleCreate) {
  const v = validateRecurringRule(data);
  if (!v.valid) throw new ValidationError(v.error || 'Datos inválidos');
  const category = await env.DB.prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ? AND archived_at IS NULL`).bind(data.categoryId, userId).first();
  if (!category) throw new ValidationError('Categoría inválida');
  let accountId = data.accountId ?? null;
  if (accountId) {
    const acc = await env.DB.prepare(`SELECT id, archived_at FROM accounts WHERE id = ? AND user_id = ?`).bind(accountId, userId).first<any>();
    if (!acc) throw new ValidationError('Cuenta inválida');
    if (acc.archived_at) throw new ValidationError('No se puede usar una cuenta archivada');
  } else {
    const def = await env.DB.prepare(`SELECT id FROM accounts WHERE user_id = ? AND archived_at IS NULL ORDER BY is_default DESC, sort_order ASC LIMIT 1`).bind(userId).first<{ id: string }>();
    accountId = def?.id ?? null;
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  const nextDueOn = data.startOn;
  await env.DB.prepare(`INSERT INTO recurring_rules (id, user_id, kind, concept, amount_minor, currency_code, category_id, account_id, frequency, day_of_month, days_of_week, month_of_year, start_on, end_on, next_due_on, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
    .bind(id, userId, data.kind, data.concept, data.amountMinor, data.currency, data.categoryId, accountId, data.frequency, data.dayOfMonth ?? null, data.daysOfWeek ?? null, data.monthOfYear ?? null, data.startOn, data.endOn ?? null, nextDueOn, now, now)
    .run();
  const row = await env.DB.prepare(`SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?`).bind(id, userId).first<any>();
  return mapRule(row);
}

export async function listRecurringRules(env: Env, userId: string) {
  const rows = await env.DB.prepare(`SELECT * FROM recurring_rules WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all<any>();
  return (rows.results as any[]).map(mapRule);
}

export async function updateRecurringRule(env: Env, userId: string, data: any) {
  const rule = await env.DB.prepare(`SELECT * FROM recurring_rules WHERE id = ? AND user_id = ? AND version = ?`).bind(data.id, userId, data.version).first<any>();
  if (!rule) throw new NotFoundError('Regla no encontrada');
  const now = Date.now();
  let categoryId = data.categoryId ?? rule.category_id;
  if (data.categoryId) {
    const cat = await env.DB.prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ? AND archived_at IS NULL`).bind(data.categoryId, userId).first();
    if (!cat) throw new ValidationError('Categoría inválida');
  }
  let accountId = data.accountId !== undefined ? data.accountId : rule.account_id;
  if (accountId) {
    const acc = await env.DB.prepare(`SELECT id, archived_at FROM accounts WHERE id = ? AND user_id = ?`).bind(accountId, userId).first<any>();
    if (!acc) throw new ValidationError('Cuenta inválida');
    if (acc.archived_at) throw new ValidationError('No se puede usar una cuenta archivada');
  }
  await env.DB.prepare(`UPDATE recurring_rules SET concept = ?, amount_minor = ?, category_id = ?, account_id = ?, frequency = ?, end_on = ?, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(data.concept ?? rule.concept, data.amountMinor ?? rule.amount_minor, categoryId, accountId, data.frequency ?? rule.frequency, data.endOn !== undefined ? data.endOn : rule.end_on, now, data.id, userId)
    .run();
  const row = await env.DB.prepare(`SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?`).bind(data.id, userId).first<any>();
  return mapRule(row);
}

export async function cancelRecurringRule(env: Env, userId: string, id: string, version: number) {
  const rule = await env.DB.prepare(`SELECT * FROM recurring_rules WHERE id = ? AND user_id = ? AND version = ?`).bind(id, userId, version).first<any>();
  if (!rule) throw new NotFoundError('Regla no encontrada');
  const now = Date.now();
  await env.DB.prepare(`UPDATE recurring_rules SET active = 0, cancelled_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).bind(now, now, id, userId).run();
  return { success: true };
}

export async function processDueRecurring(env: Env, userId?: string, asOfDate?: string) {
  const today = asOfDate ?? todayLocalISO();
  let rules: any[] = [];
  if (userId) {
    const r = await env.DB.prepare(`SELECT * FROM recurring_rules WHERE user_id = ? AND active = 1 AND (end_on IS NULL OR end_on >= ?) AND next_due_on <= ?`).bind(userId, today, today).all<any>();
    rules = r.results as any[];
  } else {
    const r = await env.DB.prepare(`SELECT * FROM recurring_rules WHERE active = 1 AND (end_on IS NULL OR end_on >= ?) AND next_due_on <= ? LIMIT 500`).bind(today, today).all<any>();
    rules = r.results as any[];
  }
  for (const rule of rules) {
    try {
      // check if account active
      if (rule.account_id) {
        const acc = await env.DB.prepare(`SELECT archived_at FROM accounts WHERE id = ? AND user_id = ?`).bind(rule.account_id, rule.user_id).first<any>();
       if (acc?.archived_at) continue; // pause if archived
       }
       // financial range guard (best-effort)
       const flowRow = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount_minor ELSE -amount_minor END),0) AS total FROM transactions WHERE user_id = ? AND currency_code = ? AND deleted_at IS NULL`).bind(rule.user_id, rule.currency_code).first<{ total: number }>();
       const currentFlow = Number(flowRow?.total ?? 0);
       const delta = rule.kind === 'income' ? rule.amount_minor : -rule.amount_minor;
       if (!Number.isSafeInteger(currentFlow + delta)) continue;
       let currentDue = rule.next_due_on;
      let processed = 0;
      while (currentDue && currentDue <= today && processed < 100) {
        const exists = await env.DB.prepare(`SELECT id FROM recurring_occurrences WHERE rule_id = ? AND due_on = ?`).bind(rule.id, currentDue).first();
        const next = computeNextDue(rule.frequency, currentDue, rule);
        if (!exists) {
          const flowRow = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_minor ELSE -amount_minor END), 0) AS total FROM transactions WHERE user_id = ? AND currency_code = ? AND deleted_at IS NULL`).bind(rule.user_id, rule.currency_code).first<{ total: number }>();
          const delta = rule.kind === 'income' ? rule.amount_minor : -rule.amount_minor;
          const projected = (flowRow?.total ?? 0) + delta;
          if (Math.abs(projected) > MAX_MINOR_UNITS) break;
          const now = Date.now();
          const txId = crypto.randomUUID();
          const occId = crypto.randomUUID();
          const seqRow = await env.DB.prepare(`SELECT sequence FROM user_sync_state WHERE user_id = ?`).bind(rule.user_id).first<{ sequence: number }>();
          const newSeq = (seqRow?.sequence ?? 0) + 1;
          const stmts = [
            env.DB.prepare(`INSERT INTO transactions (id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, note, version, change_seq, created_at, updated_at, source_type, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'recurring', ?)`)
              .bind(txId, rule.user_id, rule.category_id, rule.account_id, rule.kind, rule.amount_minor, rule.currency_code, currentDue, rule.concept, newSeq, now, now, occId),
            env.DB.prepare(`INSERT INTO recurring_occurrences (id, rule_id, user_id, due_on, transaction_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'posted', ?, ?)`)
              .bind(occId, rule.id, rule.user_id, currentDue, txId, now, now),
            env.DB.prepare(`UPDATE user_sync_state SET sequence = ? WHERE user_id = ?`).bind(newSeq, rule.user_id)
          ];
          if (next && (!rule.end_on || next <= rule.end_on)) {
            stmts.push(env.DB.prepare(`UPDATE recurring_rules SET next_due_on = ?, updated_at = ? WHERE id = ?`).bind(next, now, rule.id));
          } else {
            stmts.push(env.DB.prepare(`UPDATE recurring_rules SET active = 0, updated_at = ? WHERE id = ?`).bind(now, rule.id));
          }
           try {
             await env.DB.batch(stmts);
           } catch (e) {
             // duplicate/atomic failure -> advance to next date
             if (!next || next === currentDue) break;
             currentDue = next;
             processed += 1;
             continue;
           }
        } else {
          // occurrence already exists: ensure next_due_on advances (idempotent recovery)
          const now = Date.now();
          if (next && (!rule.end_on || next <= rule.end_on)) {
            await env.DB.prepare(`UPDATE recurring_rules SET next_due_on = ?, updated_at = ? WHERE id = ? AND (next_due_on = ? OR next_due_on < ?)`).bind(next, now, rule.id, currentDue, currentDue).run();
          } else {
            await env.DB.prepare(`UPDATE recurring_rules SET active = 0, updated_at = ? WHERE id = ?`).bind(now, rule.id).run();
          }
        }
        if (!next || next === currentDue) break;
        currentDue = next;
        processed += 1;
        if (rule.end_on && currentDue > rule.end_on) break;
      }
    } catch (e) {
      // skip user/rule on error
    }
  }
}
