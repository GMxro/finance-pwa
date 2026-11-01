// Application: Commitments
import type { Env } from '@env';
import { todayLocalISO } from '@domain/date';
import { projectOccurrences } from '@domain/recurring';

export async function listCommitments(env: Env, userId: string, from: string, to: string) {
  const today = todayLocalISO();
  // future installment transactions
  const inst = await env.DB.prepare(`SELECT id, kind, amount_minor, currency_code, occurred_on, note, source_id FROM transactions WHERE user_id = ? AND deleted_at IS NULL AND source_type = 'installment' AND occurred_on > ? AND occurred_on <= ? ORDER BY occurred_on`)
    .bind(userId, today, to)
    .all<any>();
  const commitments: any[] = [];
  for (const r of inst.results as any[]) {
    commitments.push({ date: r.occurred_on, kind: r.kind, amountMinor: r.amount_minor, currency: r.currency_code, label: r.note, source: 'installment', sourceId: r.source_id, isFuture: r.occurred_on > today });
  }
  // recurring projected
  const rules = await env.DB.prepare(`SELECT * FROM recurring_rules WHERE user_id = ? AND active = 1`).bind(userId).all<any>();
  for (const rule of rules.results as any[]) {
    const dates = projectOccurrences(rule, from, to, 24);
    for (const d of dates) {
      commitments.push({ date: d, kind: rule.kind, amountMinor: rule.amount_minor, currency: rule.currency_code, label: rule.concept, source: 'recurring', sourceId: rule.id, isFuture: true });
    }
  }
  commitments.sort((a, b) => a.date.localeCompare(b.date));
  return commitments;
}

export async function getCommitmentsSummary(env: Env, userId: string, month: string) {
  const from = `${month}-01`;
  const _p = month.split('-').map(Number); const y = _p[0]!; const m = _p[1]!;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${month}-${String(last).padStart(2, '0')}`;
  const items = await listCommitments(env, userId, from, to);
  const byCurrency: any = { ARS: { committedExpenseMinor: 0, committedIncomeMinor: 0 }, USD: { committedExpenseMinor: 0, committedIncomeMinor: 0 } };
  for (const it of items) {
    if (it.kind === 'expense') byCurrency[it.currency].committedExpenseMinor += it.amountMinor;
    else byCurrency[it.currency].committedIncomeMinor += it.amountMinor;
  }
  return { month, byCurrency };
}
