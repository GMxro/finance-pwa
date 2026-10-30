// Same-origin guard for state-changing requests.
// Authentication cookies are SameSite=Lax; this adds an explicit Origin
// check for all mutating API calls so cross-site form/fetch requests fail.
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
  const requestOrigin = new URL(c.req.url).origin;

  // Origin header is present on browser fetch/XHR. Requests without Origin
  // (same-origin navigations, server tools) are only accepted when the Host
  // matches the configured app URL.
  if (origin) {
    if (origin !== expected && origin !== requestOrigin) {
      return c.json({ code: 'FORBIDDEN_ORIGIN', message: 'Origen no permitido' }, 403);
    }
  } else if (requestOrigin !== expected) {
    return c.json({ code: 'FORBIDDEN_ORIGIN', message: 'Origen no permitido' }, 403);
  }

  await next();
}