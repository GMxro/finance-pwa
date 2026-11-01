// Contracts: Commitments
import { z } from 'zod';
import { currencyCodeSchema } from './transaction';
import { calendarDateSchema } from './date';

export const commitmentSchema = z.object({
  date: calendarDateSchema,
  kind: z.enum(['income', 'expense']),
  amountMinor: z.number().int(),
  currency: currencyCodeSchema,
  label: z.string(),
  source: z.enum(['installment', 'recurring']),
  sourceId: z.string(),
  isFuture: z.boolean()
});

export const commitmentsQuerySchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema
}).strict();

export const commitmentsSummarySchema = z.object({
  month: z.string(),
  byCurrency: z.record(z.enum(['ARS', 'USD']), z.object({
    committedExpenseMinor: z.number().int(),
    committedIncomeMinor: z.number().int()
  }))
});

export type Commitment = z.infer<typeof commitmentSchema>;
export type CommitmentsQuery = z.infer<typeof commitmentsQuerySchema>;
export type CommitmentsSummary = z.infer<typeof commitmentsSummarySchema>;
