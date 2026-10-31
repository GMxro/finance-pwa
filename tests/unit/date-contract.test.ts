import { describe, expect, it } from 'vitest';
import { transactionCreateSchema } from '@contracts/transaction';
import { transferCreateSchema } from '@contracts/transfer';
import { budgetCreateSchema } from '@contracts/budget';

describe('calendar date contracts', () => {
  it('rejects impossible dates in transaction and transfer requests', () => {
    const transaction = { id: crypto.randomUUID(), kind: 'expense', amountMinor: 100, currency: 'ARS', categoryId: 'food', occurredOn: '2025-02-29' };
    const transfer = { id: crypto.randomUUID(), fromAccountId: 'a', toAccountId: 'b', fromAmountMinor: 100, fromCurrency: 'ARS', occurredOn: '2026-04-31' };
    expect(transactionCreateSchema.safeParse(transaction).success).toBe(false);
    expect(transferCreateSchema.safeParse(transfer).success).toBe(false);
  });

  it('rejects impossible budget months', () => {
    const budget = { id: crypto.randomUUID(), categoryId: 'food', periodMonth: '2026-13', currency: 'ARS', limitMinor: 100 };
    expect(budgetCreateSchema.safeParse(budget).success).toBe(false);
  });

  it('rejects monetary values outside the exactly representable integer range', () => {
    const transaction = { id: crypto.randomUUID(), kind: 'expense', amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: 'ARS', categoryId: 'food', occurredOn: '2026-10-01' };
    expect(transactionCreateSchema.safeParse(transaction).success).toBe(false);
  });
});
