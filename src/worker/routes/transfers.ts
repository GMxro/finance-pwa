// Transfers routes
import { Hono } from 'hono';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import { transferCreateSchema } from '@contracts/transfer';
import { createTransfer, deleteTransfer, listTransfers } from '../application/transfers/transfers';

const transfersRoutes = new Hono<{ Bindings: Env }>();

transfersRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const transfers = await listTransfers(c.env, userId, {
    period: c.req.query('period') || undefined,
    accountId: c.req.query('accountId') || undefined,
    limit: c.req.query('limit') ? parseInt(c.req.query('limit') as string) : undefined
  });
  return c.json(transfers);
});

transfersRoutes.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const result = transferCreateSchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }

  const transfer = await createTransfer(c.env, userId, result.data);
  return c.json(transfer, 201);
});

transfersRoutes.delete('/:id', async (c) => {
  const userId = getUserId(c);
  await deleteTransfer(c.env, userId, c.req.param('id'));
  return c.body(null, 204);
});

export { transfersRoutes };
