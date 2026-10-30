// Contracts: Account DTOs
import { z } from 'zod';

export const accountKindSchema = z.enum(['cash', 'bank', 'wallet', 'other']);
export const accountCurrencySchema = z.enum(['ARS', 'USD']);

export const accountCreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  kind: accountKindSchema.default('cash'),
  sortOrder: z.number().int().nonnegative().default(0)
});

export const accountUpdateSchema = accountCreateSchema.partial().extend({
  isDefault: z.boolean().optional(),
  archivedAt: z.number().int().nonnegative().nullable().optional()
});

export const accountResponseSchema = accountCreateSchema.extend({
  userId: z.string(),
  isDefault: z.boolean(),
  archivedAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const accountBalanceSchema = z.object({
  currency: accountCurrencySchema,
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
