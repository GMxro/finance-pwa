// Routes: Recurring
import { Hono } from 'hono';
import type { Env } from '@env';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import { createRecurringRule, listRecurringRules, cancelRecurringRule, updateRecurringRule } from '../application/recurring/recurring';
import { recurringRuleCreateSchema, recurringRuleUpdateSchema } from '@contracts/recurring';

const recurringRoutes = new Hono<{ Bindings: Env }>();

recurringRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const items = await listRecurringRules(c.env, userId);
  return c.json(items);
});

recurringRoutes.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const parsed = recurringRuleCreateSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Datos inválidos', parsed.error.flatten());
  const result = await createRecurringRule(c.env, userId, parsed.data as any);
  return c.json(result, 201);
});

recurringRoutes.post('/:id/cancel', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = await cancelRecurringRule(c.env, userId, id, body.version);
  return c.json(result);
});

recurringRoutes.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = recurringRuleUpdateSchema.safeParse({ ...body, id });
  if (!parsed.success) throw new ValidationError('Datos inválidos', parsed.error.flatten());
  const result = await updateRecurringRule(c.env, userId, parsed.data as any);
  return c.json(result);
});

export { recurringRoutes };
