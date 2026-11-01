// Contracts: Transfer DTOs
import { z } from 'zod';
import { calendarDateSchema } from './date';
import { MAX_MINOR_UNITS } from '@domain/money';

const currencySchema = z.enum(['ARS', 'USD']);

const transferCreateBaseSchema = z.object({
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
});

export const transferCreateSchema = transferCreateBaseSchema
  .refine(data => data.fromAccountId !== data.toAccountId, {
    message: 'Elegí dos cuentas distintas',
    path: ['toAccountId']
  })
  .refine(data => {
    const toCurrency = data.toCurrency ?? data.fromCurrency;
    if (toCurrency !== data.fromCurrency) return true;
    if (data.toAmountMinor === undefined) return true;
    return data.toAmountMinor === data.fromAmountMinor;
  }, {
    message: 'En la misma moneda, el monto que entra debe ser igual al que sale.',
    path: ['toAmountMinor']
  });

export const transferResponseSchema = transferCreateBaseSchema.extend({
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
