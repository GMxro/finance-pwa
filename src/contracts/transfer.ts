// Contracts: Transfer DTOs
import { z } from 'zod';
import { calendarDateSchema } from './date';
import { MAX_MINOR_UNITS } from '@domain/money';

const currencySchema = z.enum(['ARS', 'USD']);

export const transferCreateSchema = z.object({
  id: z.string().uuid(),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  fromAmountMinor: z.number().int().positive().max(MAX_MINOR_UNITS),
  fromCurrency: currencySchema,
  // En transferencias entre monedas distintas el monto acreditado se informa
  // aparte. Si no viene, se asume la misma moneda y el mismo importe.
  toAmountMinor: z.number().int().positive().max(MAX_MINOR_UNITS).optional(),
  toCurrency: currencySchema.optional(),
  occurredOn: calendarDateSchema,
  note: z.string().max(500).optional()
}).refine(data => data.fromAccountId !== data.toAccountId, {
  message: 'Elegí dos cuentas distintas',
  path: ['toAccountId']
});

export const transferResponseSchema = transferCreateSchema.innerType().extend({
  userId: z.string(),
  toAmountMinor: z.number().int().positive().max(MAX_MINOR_UNITS),
  toCurrency: currencySchema,
  fromAccountName: z.string(),
  toAccountName: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().int().nullable()
});

export type TransferCreate = z.infer<typeof transferCreateSchema>;
export type TransferResponse = z.infer<typeof transferResponseSchema>;
