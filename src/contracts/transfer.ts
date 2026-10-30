// Contracts: Transfer DTOs
import { z } from 'zod';

const currencySchema = z.enum(['ARS', 'USD']);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const transferCreateSchema = z.object({
  id: z.string().uuid(),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  fromAmountMinor: z.number().int().positive(),
  fromCurrency: currencySchema,
  // En transferencias entre monedas distintas el monto acreditado se informa
  // aparte. Si no viene, se asume la misma moneda y el mismo importe.
  toAmountMinor: z.number().int().positive().optional(),
  toCurrency: currencySchema.optional(),
  occurredOn: dateSchema,
  note: z.string().max(500).optional()
}).refine(data => data.fromAccountId !== data.toAccountId, {
  message: 'Elegí dos cuentas distintas',
  path: ['toAccountId']
});

export const transferResponseSchema = transferCreateSchema.innerType().extend({
  userId: z.string(),
  toAmountMinor: z.number().int().positive(),
  toCurrency: currencySchema,
  fromAccountName: z.string(),
  toAccountName: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().int().nullable()
});

export type TransferCreate = z.infer<typeof transferCreateSchema>;
export type TransferResponse = z.infer<typeof transferResponseSchema>;
