// Routes: Commitments
import { Hono } from 'hono';
import type { Env } from '@env';
import { getUserId } from '../middleware/session';
import { listCommitments, getCommitmentsSummary } from '../application/commitments/commitments';
import { processDueRecurring } from '../application/recurring/recurring';

const commitmentsRoutes = new Hono<{ Bindings: Env }>();

commitmentsRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!from || !to) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'from y to requeridos' } }, 400);
  try { await processDueRecurring(c.env, userId); } catch {}
  const items = await listCommitments(c.env, userId, from, to);
  return c.json(items);
});

commitmentsRoutes.get('/summary', async (c) => {
  const userId = getUserId(c);
  const month = c.req.query('month');
  if (!month) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'month requerido' } }, 400);
  const summary = await getCommitmentsSummary(c.env, userId, month);
  return c.json(summary);
});

export { commitmentsRoutes };
