import { describe, expect, it } from 'vitest';
import { computeMonthlySummary } from '@domain/summary';

describe('financial aggregate precision', () => {
  it('fails explicitly instead of rounding when totals exceed safe integer range', () => {
    const transactions = [
      { id: 'a', kind: 'income', amountMinor: Number.MAX_SAFE_INTEGER, currency: 'ARS', occurredOn: '2026-10-01', deletedAt: null, categoryId: 'salary' },
      { id: 'b', kind: 'income', amountMinor: 1, currency: 'ARS', occurredOn: '2026-10-02', deletedAt: null, categoryId: 'salary' }
    ] as any;
    expect(() => computeMonthlySummary(transactions, '2026-10', 'ARS')).toThrow('rango exacto');
  });
});
