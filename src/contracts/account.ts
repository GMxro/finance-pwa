// Contracts: Account DTOs
import { z } from 'zod';

export const accountKindSchema = z.enum(['cash', 'bank', 'credit_card', 'investment']);

export const accountCreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  description: z.string().max(200).nullable().optional(),
  kind: accountKindSchema.default('cash'),
  sortOrder: z.number().int().nonnegative().default(0),
  initialAmountMinor: z.number().int().optional(),
  initialCurrency: z.enum(['ARS', 'USD']).optional()
});

export const accountUpdateSchema = accountCreateSchema.partial().extend({
  isDefault: z.boolean().optional(),
  archivedAt: z.number().int().nonnegative().nullable().optional()
});

export const accountResponseSchema = accountCreateSchema.omit({ initialAmountMinor: true, initialCurrency: true }).extend({
  userId: z.string(),
  isDefault: z.boolean(),
  archivedAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const accountBalanceSchema = z.object({
  currency: z.enum(['ARS', 'USD']),
  amountMinor: z.number().int()
});

export const accountWithBalancesSchema = accountResponseSchema.extend({
  balances: z.array(accountBalanceSchema)
});

export type AccountKind = z.infer<typeof accountKindSchema>;
export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type AccountBalance = z.infer<typeof accountBalanceSchema>;
export type AccountWithBalances = z.infer<typeof accountWithBalancesSchema>;
