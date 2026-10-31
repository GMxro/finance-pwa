// Transfers routes
import { Hono } from 'hono';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import { transferCreateSchema } from '@contracts/transfer';
import { calendarMonthSchema } from '@contracts/date';
import { createTransfer, deleteTransfer, listTransfers } from '../application/transfers/transfers';

const transfersRoutes = new Hono<{ Bindings: Env }>();

transfersRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const period = c.req.query('period') || undefined;
  const rawLimit = c.req.query('limit');
  const rawPage = c.req.query('page');
  const limit = rawLimit === undefined ? 100 : Number(rawLimit);
  const page = rawPage === undefined ? 1 : Number(rawPage);
  if (period && !calendarMonthSchema.safeParse(period).success) {
    throw new ValidationError('Período mensual inválido.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError('El límite debe estar entre 1 y 100.');
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    throw new ValidationError('La página debe estar entre 1 y 10000.');
  }
  const transfers = await listTransfers(c.env, userId, {
    period,
    accountId: c.req.query('accountId') || undefined,
    page,
    limit
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
