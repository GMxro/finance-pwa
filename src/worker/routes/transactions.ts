// Transactions routes
import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import { createTransaction, updateTransaction, deleteTransaction, listTransactions } from '../application/transactions/transactions';

const transactionsRoutes = new Hono<{ Bindings: Env }>();

transactionsRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const query = c.req.query();
  
  const params = {
    period: query.period,
    currency: query.currency,
    kind: query.kind,
    categoryId: query.categoryId,
    page: query.page ? parseInt(query.page) : 1,
    limit: query.limit ? parseInt(query.limit) : 50
  };
  
  const result = await listTransactions(c.env, userId, params);
  return c.json(result);
});

const createTxSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['income', 'expense']),
  amountMinor: z.number().int().positive(),
  currency: z.enum(['ARS', 'USD']),
  categoryId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  amountMinor: z.number().int().positive().optional(),
  currency: z.enum(['ARS', 'USD']).optional(),
  categoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

export { transactionsRoutes };
