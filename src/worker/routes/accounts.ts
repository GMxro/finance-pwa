// Accounts routes
import { Hono } from 'hono';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import { accountCreateSchema, accountUpdateSchema } from '@contracts/account';
import { createAccount, listAccounts, updateAccount } from '../application/accounts/accounts';

const accountsRoutes = new Hono<{ Bindings: Env }>();

accountsRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const includeArchived = c.req.query('includeArchived') === '1';
  const accounts = await listAccounts(c.env, userId, includeArchived);
  return c.json(accounts);
});

accountsRoutes.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const result = accountCreateSchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }

  const account = await createAccount(c.env, userId, result.data);
  return c.json(account, 201);
});

accountsRoutes.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = accountUpdateSchema.safeParse({ ...body, id });

  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }

  const account = await updateAccount(c.env, userId, { ...result.data, id });
  return c.json(account);
});

export { accountsRoutes };
