// Application: Calendar
import type { Env } from '@env';
import { listTransactions } from '../transactions/transactions';
import { listCommitments } from '../commitments/commitments';
import { todayLocalISO } from '@domain/date';

export async function getCalendarMonth(env: Env, userId: string, month: string) {
  const _p = month.split('-').map(Number); const y = _p[0]!; const m = _p[1]!;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(last).padStart(2, '0')}`;
  const today = todayLocalISO();
  // get all transactions for month
  const transactions = await listTransactions(env, userId, { period: month, page: 1, limit: 1000 });
  const commitments = await listCommitments(env, userId, from, to);
  const days: any = {};
  for (let d = 1; d <= last; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    days[key] = { date: key, transactions: [], commitments: [], incomeMinor: 0, expenseMinor: 0, isFuture: key > today };
  }
  for (const tx of transactions as any[]) {
    if (days[tx.occurredOn]) {
      days[tx.occurredOn].transactions.push(tx);
      if (tx.kind === 'income') days[tx.occurredOn].incomeMinor += tx.amountMinor;
      else days[tx.occurredOn].expenseMinor += tx.amountMinor;
    }
  }
  for (const c of commitments) {
    if (c.source === 'installment') continue; // ya aparece como transacción
    if (days[c.date]) days[c.date].commitments.push(c);
  }
  return Object.values(days);
}
