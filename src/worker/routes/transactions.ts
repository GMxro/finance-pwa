// Transactions routes
import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import { calendarDateSchema } from '@contracts/date';
import { MAX_MINOR_UNITS } from '@domain/money';
import { transactionListQuerySchema } from '@contracts/transaction';
import { calendarMonthSchema } from '@contracts/date';
import { createTransaction, updateTransaction, deleteTransaction, listTransactions } from '../application/transactions/transactions';
import { getMonthlySummary } from '../application/transactions/transactions';

const transactionsRoutes = new Hono<{ Bindings: Env }>();

transactionsRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const parsed = transactionListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw new ValidationError('Parámetros de consulta inválidos.', parsed.error.issues);

  const result = await listTransactions(c.env, userId, parsed.data);
  return c.json(result);
});

const createTxSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['income', 'expense']),
  amountMinor: z.number().int().positive().max(MAX_MINOR_UNITS),
  currency: z.enum(['ARS', 'USD']),
  categoryId: z.string().min(1),
  accountId: z.string().min(1),
  occurredOn: calendarDateSchema,
  note: z.string().max(500).optional()
});

transactionsRoutes.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const result = createTxSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  const tx = await createTransaction(c.env, userId, result.data);
  return c.json(tx, 201);
});

const updateTxSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['income', 'expense']).optional(),
  amountMinor: z.number().int().positive().max(MAX_MINOR_UNITS).optional(),
  currency: z.enum(['ARS', 'USD']).optional(),
  categoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  occurredOn: calendarDateSchema.optional(),
  note: z.string().max(500).optional().nullable(),
  version: z.number().int().positive()
});

transactionsRoutes.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = updateTxSchema.safeParse({ ...body, id });
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  const tx = await updateTransaction(c.env, userId, result.data);
  return c.json(tx);
});

const deleteTxSchema = z.object({
  version: z.number().int().positive()
});

transactionsRoutes.delete('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = deleteTxSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  await deleteTransaction(c.env, userId, id, result.data.version);
  return c.body(null, 204);
});

transactionsRoutes.get('/summary', async (c) => {
  const userId = getUserId(c);
  const period = c.req.query('period');
  const currency = c.req.query('currency') as 'ARS' | 'USD' | undefined;
  
  if (!period || !calendarMonthSchema.safeParse(period).success) {
    throw new ValidationError('Período mensual inválido.');
  }
  if (currency && !['ARS', 'USD'].includes(currency)) {
    throw new ValidationError('Moneda inválida.');
  }
  
  const summary = await getMonthlySummary(c.env, userId, period, currency);
  return c.json(summary);
});

export { transactionsRoutes };
