// Contracts: Budget DTOs
import { z } from 'zod';

export const budgetCreateSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().min(1),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
  currency: z.enum(['ARS', 'USD']),
  limitMinor: z.number().int().positive()
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
  spentMinor: z.number().int().nonnegative(),
  remainingMinor: z.number().int(),
  isOverBudget: z.boolean()
});

export type BudgetCreate = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdate = z.infer<typeof budgetUpdateSchema>;
export type BudgetResponse = z.infer<typeof budgetResponseSchema>;
export type BudgetWithSpent = z.infer<typeof budgetWithSpentSchema>;