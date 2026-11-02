// Routes: Installments
import { Hono } from 'hono';
import type { Env } from '@env';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import { createInstallmentPlan, listInstallmentPlans, cancelInstallmentPlan, updateInstallmentItem } from '../application/installments/installments';
import { installmentPlanCreateSchema, installmentPlanUpdateSchema, installmentItemUpdateSchema } from '@contracts/installment';

const installmentRoutes = new Hono<{ Bindings: Env }>();

installmentRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const items = await listInstallmentPlans(c.env, userId);
  return c.json(items);
});

installmentRoutes.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const parsed = installmentPlanCreateSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Datos inválidos', parsed.error.flatten());
  const result = await createInstallmentPlan(c.env, userId, parsed.data as any);
  return c.json(result, 201);
});

installmentRoutes.post('/:id/cancel', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = await cancelInstallmentPlan(c.env, userId, id, body.version);
  return c.json(result);
});

installmentRoutes.patch('/items/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = installmentItemUpdateSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Datos inválidos', parsed.error.flatten());
  const result = await updateInstallmentItem(c.env, userId, id, parsed.data as any);
  return c.json(result);
});

export { installmentRoutes };
