// Mutations must come from the one configured public origin. The request Host
// is not an authority for approving a caller-supplied Origin header.
// NOTE (SEC-03): Better Auth retains a request-derived origin fallback for
// Origin: null. This guard is mandatory on /api/* and must not be removed.
import type { Context, Next } from 'hono';
import type { Env } from '@env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function sameOriginGuard(c: Context<{ Bindings: Env }>, next: Next) {
  if (SAFE_METHODS.has(c.req.method)) {
    // Mark API responses as non-cacheable.
    await next();
    c.header('Cache-Control', 'no-store');
    return;
  }

  const origin = c.req.header('origin');
  const expected = new URL(c.env.BETTER_AUTH_URL).origin;
  if (!origin || origin !== expected) {
    return c.json({ code: 'FORBIDDEN_ORIGIN', message: 'Origen no permitido' }, 403);
  }

  await next();
}
