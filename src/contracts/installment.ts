// Contracts: Installments
import { z } from 'zod';
import { currencyCodeSchema } from './transaction';
import { calendarDateSchema } from './date';

export const installmentPlanCreateSchema = z.object({
  concept: z.string().min(1).max(200),
  totalMinor: z.number().int().positive(),
  currency: currencyCodeSchema,
  installmentsCount: z.number().int().min(2).max(999),
  categoryId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  firstDueOn: calendarDateSchema
}).strict();

export const installmentItemResponseSchema = z.object({
  id: z.string(),
  planId: z.string(),
  installmentNumber: z.number(),
  dueOn: calendarDateSchema,
  amountMinor: z.number().int(),
  currency: currencyCodeSchema,
  transactionId: z.string().nullable(),
  status: z.enum(['posted', 'cancelled'])
});

export const installmentPlanResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  concept: z.string(),
  totalMinor: z.number().int(),
  currency: currencyCodeSchema,
  installmentsCount: z.number(),
  categoryId: z.string(),
  accountId: z.string().nullable(),
  firstDueOn: calendarDateSchema,
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  cancelledAt: z.number().nullable(),
  items: z.array(installmentItemResponseSchema)
});

export const installmentPlanUpdateSchema = z.object({
  id: z.string().uuid(),
  concept: z.string().min(1).max(200).optional(),
  categoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional().nullable(),
  version: z.number().int().positive()
}).strict();

export type InstallmentPlanCreate = z.infer<typeof installmentPlanCreateSchema>;
export type InstallmentPlanResponse = z.infer<typeof installmentPlanResponseSchema>;
export type InstallmentItemResponse = z.infer<typeof installmentItemResponseSchema>;
export const installmentItemUpdateSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  occurredOn: calendarDateSchema.optional(),
  note: z.string().max(500).optional().nullable(),
  version: z.number().int().positive()
}).strict();

export type InstallmentPlanUpdate = z.infer<typeof installmentPlanUpdateSchema>;
export type InstallmentItemUpdate = z.infer<typeof installmentItemUpdateSchema>;
