// Application: Calendar
import type { Env } from '@env';
import type { TransactionResponse } from '@contracts/transaction';
import { listTransactions } from '../transactions/transactions';
import { INITIAL_SOURCE_TYPE } from '../transactions/transaction-filters';
import { listCommitments } from '../commitments/commitments';
import { todayLocalISO } from '@domain/date';

export interface CalendarCurrencyTotals {
  incomeMinor: number;
  expenseMinor: number;
}

export interface CalendarCommitment {
  date: string;
  kind: 'income' | 'expense';
  amountMinor: number;
  currency: string;
  label: string;
  source: 'installment' | 'recurring';
  sourceId: string | null;
  isFuture: boolean;
}

export interface CalendarDay {
  date: string;
  transactions: TransactionResponse[];
  commitments: CalendarCommitment[];
  byCurrency: Record<string, CalendarCurrencyTotals>;
  isFuture: boolean;
}

function emptyTotals(): CalendarCurrencyTotals {
  return { incomeMinor: 0, expenseMinor: 0 };
}

function addCurrencyTotal(day: CalendarDay, currency: string, kind: string, amountMinor: number): void {
  const bucket = day.byCurrency[currency] ?? emptyTotals();
  if (kind === 'income') bucket.incomeMinor += amountMinor;
  else bucket.expenseMinor += amountMinor;
  day.byCurrency[currency] = bucket;
}

export async function getCalendarMonth(env: Env, userId: string, month: string): Promise<CalendarDay[]> {
  const _p = month.split('-').map(Number); const y = _p[0]!; const m = _p[1]!;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(last).padStart(2, '0')}`;
  const today = todayLocalISO();

  const transactions = await listTransactions(env, userId, { period: month, page: 1, limit: 1000 });
  const commitments = await listCommitments(env, userId, from, to) as CalendarCommitment[];

  const days = new Map<string, CalendarDay>();
  for (let d = 1; d <= last; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    days.set(key, {
      date: key,
      transactions: [],
      commitments: [],
      byCurrency: { ARS: emptyTotals(), USD: emptyTotals() },
      isFuture: key > today
    });
  }

  for (const tx of transactions) {
    if (tx.sourceType === INITIAL_SOURCE_TYPE) continue;
    const day = days.get(tx.occurredOn);
    if (!day) continue;
    day.transactions.push(tx);
    addCurrencyTotal(day, tx.currency, tx.kind, tx.amountMinor);
  }

  for (const commitment of commitments) {
    // Las cuotas ya llegan como transacción; contarlas otra vez duplicaría el día.
    if (commitment.source === 'installment') continue;
    const day = days.get(commitment.date);
    if (!day) continue;
    day.commitments.push(commitment);
    addCurrencyTotal(day, commitment.currency, commitment.kind, commitment.amountMinor);
  }

  return Array.from(days.values());
}
