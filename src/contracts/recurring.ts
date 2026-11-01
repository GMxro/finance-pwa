// Contracts: Recurring
import { z } from 'zod';
import { currencyCodeSchema } from './transaction';
import { calendarDateSchema } from './date';

const frequencySchema = z.enum([
  'never','daily','weekly_days','weekend','weekly','biweekly','four_weekly',
  'monthly','month_end','bimonthly','trimonthly','fourmonthly','sixmonthly','yearly'
]);

export const recurringRuleCreateSchema = z.object({
  kind: z.enum(['income', 'expense']),
  concept: z.string().min(1).max(200),
  amountMinor: z.number().int().positive(),
  currency: currencyCodeSchema,
  categoryId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  frequency: frequencySchema,
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  daysOfWeek: z.number().int().optional(),
  monthOfYear: z.number().int().min(1).max(12).optional(),
  startOn: calendarDateSchema,
  endOn: calendarDateSchema.optional().nullable()
}).strict();

export const recurringRuleUpdateSchema = z.object({
  id: z.string().uuid(),
  concept: z.string().min(1).max(200).optional(),
  amountMinor: z.number().int().positive().optional(),
  categoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional().nullable(),
  frequency: frequencySchema.optional(),
  endOn: calendarDateSchema.optional().nullable(),
  version: z.number().int().positive()
}).strict();

export const recurringRuleResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: z.enum(['income', 'expense']),
  concept: z.string(),
  amountMinor: z.number().int(),
  currency: currencyCodeSchema,
  categoryId: z.string(),
  accountId: z.string().nullable(),
  frequency: frequencySchema,
  dayOfMonth: z.number().nullable(),
  daysOfWeek: z.number().nullable(),
  monthOfYear: z.number().nullable(),
  startOn: calendarDateSchema,
  endOn: calendarDateSchema.nullable(),
  nextDueOn: calendarDateSchema,
  active: z.boolean(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  cancelledAt: z.number().nullable()
});

export type RecurringRuleCreate = z.infer<typeof recurringRuleCreateSchema>;
export type RecurringRuleUpdate = z.infer<typeof recurringRuleUpdateSchema>;
export type RecurringRuleResponse = z.infer<typeof recurringRuleResponseSchema>;
