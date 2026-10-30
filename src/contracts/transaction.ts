// Contracts: Transaction DTOs
import { z } from 'zod';

export const transactionKindSchema = z.enum(['income', 'expense']);
export const currencyCodeSchema = z.enum(['ARS', 'USD']);

export const transactionCreateSchema = z.object({
  id: z.string().uuid(),
  kind: transactionKindSchema,
  amountMinor: z.number().int().positive(),
  currency: currencyCodeSchema,
  categoryId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional()
});

export const transactionUpdateSchema = transactionCreateSchema.partial().extend({
  note: z.string().max(500).optional().nullable(),
  version: z.number().int().positive()
});

export const transactionResponseSchema = transactionCreateSchema.extend({
  userId: z.string(),
  accountId: z.string().nullable(),
  version: z.number().int().positive(),
  changeSeq: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable()
});

export const transactionListQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  currency: currencyCodeSchema.optional(),
  kind: transactionKindSchema.optional(),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

export const syncTransactionsQuerySchema = z.object({
  epoch: z.string().uuid(),
  after: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().positive().max(500).default(100)
});

export type TransactionCreate = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
export type TransactionResponse = z.infer<typeof transactionResponseSchema>;
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
export type SyncTransactionsQuery = z.infer<typeof syncTransactionsQuerySchema>;
