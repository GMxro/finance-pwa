// Contracts: Budget DTOs
import { z } from 'zod';
import { calendarMonthSchema } from './date';
import { MAX_MINOR_UNITS } from '@domain/money';

export const budgetCreateSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().min(1),
  periodMonth: calendarMonthSchema,
  currency: z.enum(['ARS', 'USD']),
  limitMinor: z.number().int().positive().max(MAX_MINOR_UNITS)
});

export const budgetUpdateSchema = budgetCreateSchema.partial().extend({
  version: z.number().int().positive()
});

export const budgetResponseSchema = budgetCreateSchema.extend({
  userId: z.string(),
  version: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const budgetWithSpentSchema = budgetResponseSchema.extend({
  spentMinor: z.number().int().nonnegative().max(MAX_MINOR_UNITS),
  remainingMinor: z.number().int(),
  isOverBudget: z.boolean()
});

export type BudgetCreate = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdate = z.infer<typeof budgetUpdateSchema>;
export type BudgetResponse = z.infer<typeof budgetResponseSchema>;
export type BudgetWithSpent = z.infer<typeof budgetWithSpentSchema>;
