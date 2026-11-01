// Routes: Calendar
import { Hono } from 'hono';
import type { Env } from '@env';
import { getUserId } from '../middleware/session';
import { getCalendarMonth } from '../application/calendar/calendar';
import { processDueRecurring } from '../application/recurring/recurring';

const calendarRoutes = new Hono<{ Bindings: Env }>();

calendarRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const month = c.req.query('month');
  if (!month) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'month requerido' } }, 400);
  try { await processDueRecurring(c.env, userId); } catch {}
  const days = await getCalendarMonth(c.env, userId, month);
  return c.json(days);
});

export { calendarRoutes };
