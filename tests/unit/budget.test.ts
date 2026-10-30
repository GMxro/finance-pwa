import { describe, it, expect } from 'vitest';
import { calculateBudgetStatus, validateBudget } from '@domain/budget';
import type { BudgetStored } from '@domain/budget';

const baseBudget: BudgetStored = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  categoryId: 'cat-1',
  periodMonth: '2026-10',
  currencyCode: 'ARS',
  limitMinor: 100000,
  version: 1,
  createdAt: 0,
  updatedAt: 0
};

describe('budget', () => {
  it('calculates remaining within limit', () => {
    const status = calculateBudgetStatus(baseBudget, 40000);
    expect(status.remainingMinor).toBe(60000);
    expect(status.isOverBudget).toBe(false);
  });

  it('marks over-budget with a negative remainder', () => {
    const status = calculateBudgetStatus(baseBudget, 120000);
    expect(status.remainingMinor).toBe(-20000);
    expect(status.isOverBudget).toBe(true);
  });

  it('rejects invalid limits and periods', () => {
    expect(validateBudget({ ...baseBudget, limitMinor: 0 }).valid).toBe(false);
    expect(validateBudget({ ...baseBudget, periodMonth: '2026-13' }).valid).toBe(false);
    expect(validateBudget({ ...baseBudget, currencyCode: 'EUR' as any }).valid).toBe(false);
    expect(validateBudget(baseBudget).valid).toBe(true);
  });
});