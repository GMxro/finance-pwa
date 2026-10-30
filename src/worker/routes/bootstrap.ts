import { Hono } from 'hono';
import type { Env } from '@env';
import { getUserId } from '../middleware/session';
import { initializeUserData } from '../application/bootstrap/initialize-user';

const bootstrapRoutes = new Hono<{ Bindings: Env }>();

bootstrapRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  await initializeUserData(c.env, userId);
  return c.json({ userId, syncEpoch: c.env.SYNC_EPOCH });
});

export { bootstrapRoutes };
