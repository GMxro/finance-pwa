// Budgets routes
import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import { calendarMonthSchema } from '@contracts/date';
import { MAX_MINOR_UNITS } from '@domain/money';
import { upsertBudget, updateBudget, listBudgets, deleteBudget } from '../application/budgets/budgets';

const budgetsRoutes = new Hono<{ Bindings: Env }>();

budgetsRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const period = c.req.query('period');
  
  if (!period || !calendarMonthSchema.safeParse(period).success) {
    throw new ValidationError('Período requerido (YYYY-MM)');
  }
  
  const budgets = await listBudgets(c.env, userId, period);
  return c.json(budgets);
});

const budgetSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().min(1),
  periodMonth: calendarMonthSchema,
  currency: z.enum(['ARS', 'USD']),
  limitMinor: z.number().int().positive().max(MAX_MINOR_UNITS)
});

budgetsRoutes.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const result = budgetSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  const budget = await upsertBudget(c.env, userId, result.data);
  return c.json(budget, 201);
});

const updateBudgetSchema = budgetSchema.partial().extend({
  version: z.number().int().positive()
});

budgetsRoutes.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = updateBudgetSchema.safeParse({ ...body, id });
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  const budget = await updateBudget(c.env, userId, result.data);
  return c.json(budget);
});

budgetsRoutes.delete('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const version = Number(body?.version);

  if (!Number.isInteger(version) || version <= 0) {
    throw new ValidationError('Versión requerida');
  }

  await deleteBudget(c.env, userId, id, version);
  return c.json({ success: true });
});

export { budgetsRoutes };
