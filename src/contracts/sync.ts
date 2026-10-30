// Contracts: Sync DTOs
import { z } from 'zod';

export const syncCursorSchema = z.object({
  epoch: z.string().uuid(),
  sequence: z.number().int().nonnegative()
});

export const syncBatchItemSchema = z.object({
  id: z.string().uuid(),
  operationId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.unknown()),
  version: z.number().int().positive().optional()
});

export const syncPushSchema = z.object({
  epoch: z.string().uuid(),
  items: z.array(syncBatchItemSchema).max(50)
});

export const syncPullResponseSchema = z.object({
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
