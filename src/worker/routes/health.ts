// Health check route
import { Hono } from 'hono';
import type { Env } from '@env';

declare const __APP_VERSION__: string;

const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
  });
});

healthRoutes.get('/health/ready', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({ status: 'ready', db: 'connected' });
  } catch {
    return c.json({ status: 'degraded', db: 'disconnected' }, 503);
  }
});

export { healthRoutes };
