// Domain: Budget logic

import type { CurrencyCode } from './money';
import { isValidMonth } from './date';

export interface BudgetInput {
  id: string;
  userId: string;
  categoryId: string;
  periodMonth: string; // YYYY-MM
  currencyCode: CurrencyCode;
  limitMinor: number;
}

export interface BudgetStored extends BudgetInput {
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface BudgetWithSpent extends BudgetStored {
  spentMinor: number;
  remainingMinor: number;
  isOverBudget: boolean;
}

export function calculateBudgetStatus(
  budget: BudgetStored,
  spentMinor: number
): BudgetWithSpent {
  const remainingMinor = budget.limitMinor - spentMinor;
  return {
    ...budget,
    spentMinor,
    remainingMinor,
    isOverBudget: remainingMinor < 0
  };
}

export function validateBudget(input: BudgetInput): { valid: boolean; error?: string } {
  if (!input.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) {
    return { valid: false, error: 'ID inválido' };
  }
  if (!input.userId) {
    return { valid: false, error: 'Usuario requerido' };
  }
  if (!input.categoryId) {
    return { valid: false, error: 'Categoría requerida' };
  }
  if (!isValidMonth(input.periodMonth)) {
    return { valid: false, error: 'Período inválido (YYYY-MM)' };
  }
  if (input.currencyCode !== 'ARS' && input.currencyCode !== 'USD') {
    return { valid: false, error: 'Moneda inválida' };
  }
  if (!Number.isInteger(input.limitMinor) || input.limitMinor <= 0) {
    return { valid: false, error: 'Límite inválido' };
  }
  return { valid: true };
}