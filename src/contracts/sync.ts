// Contracts: Sync DTOs
import { z } from 'zod';
import { transactionCreateSchema, transactionKindSchema, currencyCodeSchema } from './transaction';
import { calendarDateSchema } from './date';
import { MAX_MINOR_UNITS } from '@domain/money';

const syncTransactionUpdateSchema = z.object({
  id: z.string().uuid(),
  kind: transactionKindSchema.optional(),
  amountMinor: z.number().int().positive().max(MAX_MINOR_UNITS).optional(),
  currency: currencyCodeSchema.optional(),
  categoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  occurredOn: calendarDateSchema.optional(),
  note: z.string().max(500).nullable().optional()
}).strict().refine((payload) => Object.keys(payload).some((key) => key !== 'id'), {
  message: 'La actualización debe contener al menos un campo.'
});

const syncTransactionDeleteSchema = z.object({ id: z.string().uuid() }).strict();

export const syncBatchItemSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().uuid(), operationId: z.string().uuid(), userId: z.string().min(1),
    type: z.literal('create'), payload: transactionCreateSchema.extend({ note: z.string().max(500).nullable().optional() }).strict(), version: z.number().int().positive().optional()
  }).strict(),
  z.object({
    id: z.string().uuid(), operationId: z.string().uuid(), userId: z.string().min(1),
    type: z.literal('update'), payload: syncTransactionUpdateSchema, version: z.number().int().positive()
  }).strict(),
  z.object({
    id: z.string().uuid(), operationId: z.string().uuid(), userId: z.string().min(1),
    type: z.literal('delete'), payload: syncTransactionDeleteSchema, version: z.number().int().positive()
  }).strict()
]).refine((item) => item.payload.id === item.id, {
  message: 'El identificador de entidad no coincide con el payload.',
  path: ['payload', 'id']
});

export const syncCursorSchema = z.object({
  epoch: z.string().uuid(),
  sequence: z.number().int().nonnegative()
});

export const syncPushSchema = z.object({
  epoch: z.string().uuid(),
  items: z.array(syncBatchItemSchema).max(50)
}).strict();

export const syncPullResponseSchema = z.object({
  userId: z.string().min(1),
  epoch: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  transactions: z.array(z.record(z.unknown())),
  tombstones: z.array(z.object({
    id: z.string().uuid(),
    deletedAt: z.number()
  })),
  hasMore: z.boolean()
});

export const syncTransactionsQuerySchema = z.object({
  epoch: z.string().uuid(),
  after: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(500).default(100)
});

export type SyncCursor = z.infer<typeof syncCursorSchema>;
export type SyncBatchItem = z.infer<typeof syncBatchItemSchema>;
export type SyncPush = z.infer<typeof syncPushSchema>;
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;
export type SyncTransactionsQuery = z.infer<typeof syncTransactionsQuerySchema>;
