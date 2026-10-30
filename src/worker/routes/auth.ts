// Auth routes - mount Better Auth handlers
import { Hono } from 'hono';
import { getAuth } from '../auth/auth';
import type { Env } from '@env';

const authRoutes = new Hono<{ Bindings: Env }>();

// All Better Auth routes are handled by the library
// We mount the handler at /api/auth/*
authRoutes.all('/*', async (c) => {
  const authInstance = getAuth(c.env);
  return authInstance.handler(c.req.raw);
});

export { authRoutes };