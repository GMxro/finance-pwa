// Domain: Summary calculations (shared between client and worker)

import { addAmounts, subtractAmounts } from './money';
import type { CurrencyCode } from './money';
import type { TransactionStored } from './transaction';
import { isValidISODate } from './date';

export interface MonthlySummary {
  periodMonth: string; // YYYY-MM
  currency: CurrencyCode;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  byCategory: Array<{ categoryId: string; kind: 'income' | 'expense'; amountMinor: number }>;
  transactionCount: number;
}

export function computeMonthlySummary(
  transactions: TransactionStored[],
  periodMonth: string,
  currency: CurrencyCode
): MonthlySummary {
  const filtered = transactions.filter(
    (tx) => tx.currency === currency && isValidISODate(tx.occurredOn) && tx.occurredOn.startsWith(periodMonth) && !tx.deletedAt && tx.sourceType !== 'initial'
  );

  let incomeMinor = 0;
  let expenseMinor = 0;
  const byCategoryMap = new Map<string, { kind: 'income' | 'expense'; amountMinor: number }>();

  for (const tx of filtered) {
    if (tx.kind === 'income') {
      incomeMinor = addAmounts(incomeMinor, tx.amountMinor);
    } else {
      expenseMinor = addAmounts(expenseMinor, tx.amountMinor);
    }
    const key = `${tx.kind}:${tx.categoryId}`;
    const existing = byCategoryMap.get(key);
    if (existing) {
      existing.amountMinor = addAmounts(existing.amountMinor, tx.amountMinor);
    } else {
      byCategoryMap.set(key, { kind: tx.kind, amountMinor: tx.amountMinor });
    }
  }

  const byCategory = Array.from(byCategoryMap.entries()).map(([key, value]) => ({
    categoryId: key.slice(key.indexOf(':') + 1),
    kind: value.kind,
    amountMinor: value.amountMinor
  }));

  return {
    periodMonth,
    currency,
    incomeMinor,
    expenseMinor,
    netMinor: subtractAmounts(incomeMinor, expenseMinor),
    byCategory,
    transactionCount: filtered.length
  };
}

export function computeAllCurrenciesSummary(
  transactions: TransactionStored[],
  periodMonth: string
): MonthlySummary[] {
  return ['ARS', 'USD'].map((currency) =>
    computeMonthlySummary(transactions, periodMonth, currency as CurrencyCode)
  );
}
