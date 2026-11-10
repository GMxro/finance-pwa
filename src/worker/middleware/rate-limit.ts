import type { Context, Next } from 'hono';
import type { Env } from '@env';
import { getUserId } from './session';

const WINDOW_MS = 60_000;

export async function apiMutationRateLimit(c: Context<{ Bindings: Env }>, next: Next) {
  const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
  const bucket = readOnly ? 'reads' : c.req.path.startsWith('/api/sync/') ? 'sync' : 'mutations';
  const limit = bucket === 'sync' ? 20 : bucket === 'reads' ? 180 : 60;
  const userId = getUserId(c);
  let count: number;
  try {
    count = await consumeRateLimit(c.env, `user:${userId}`, userId, bucket);
  } catch {
    return c.json({ code: 'RATE_LIMIT_UNAVAILABLE', message: 'No pudimos validar el límite de solicitudes.' }, 503);
  }

  if (count > limit) return rateLimited(c);
  if (!readOnly && c.req.path !== '/api/account/delete') {
    const deletion = await c.env.DB.prepare(`
      SELECT deletion_pending_at FROM user_preferences WHERE user_id = ?
    `).bind(userId).first<{ deletion_pending_at: number | null }>();
    if (deletion?.deletion_pending_at) {
      return c.json({ code: 'ACCOUNT_DELETION_PENDING', message: 'La eliminación de la cuenta debe completarse antes de continuar.' }, 409);
    }
  }
  await next();
}

export async function authRateLimit(c: Context<{ Bindings: Env }>, next: Next) {
  const ip = c.req.header('cf-connecting-ip') ?? 'unattributed';
  try {
    await c.env.DB.prepare(`DELETE FROM api_rate_limits WHERE user_id IS NULL AND window_started_at < ?`)
      .bind(Date.now() - 86_400_000).run();
    const ipKey = await hashKey(`ip:${ip}`);
    if (await consumeRateLimit(c.env, ipKey, null, 'auth') > 30) return rateLimited(c);
  } catch {
    return c.json({ code: 'RATE_LIMIT_UNAVAILABLE', message: 'No pudimos validar el límite de solicitudes.' }, 503);
  }
  await next();
}

export async function deletionStatusRateLimit(c: Context<{ Bindings: Env }>, next: Next) {
  const ip = c.req.header('cf-connecting-ip') ?? 'unattributed';
  try {
    await c.env.DB.prepare(`DELETE FROM api_rate_limits WHERE user_id IS NULL AND window_started_at < ?`)
      .bind(Date.now() - 86_400_000).run();
    const ipKey = await hashKey(`ip:${ip}`);
    if (await consumeRateLimit(c.env, ipKey, null, 'deletion-status') > 30) return rateLimited(c);
  } catch {
    return c.json({ code: 'RATE_LIMIT_UNAVAILABLE', message: 'No pudimos validar el límite de solicitudes.' }, 503);
  }
  await next();
}

function rateLimited(c: Context<{ Bindings: Env }>) {
  const retryAfter = Math.ceil((Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS + WINDOW_MS - Date.now()) / 1000);
  c.header('Retry-After', String(retryAfter));
  return c.json({ code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Esperá un momento y volvé a intentar.' }, 429);
}

export async function consumeRateLimit(
  env: Env,
  actorKey: string,
  userId: string | null,
  bucket: string,
  now = Date.now()
): Promise<number> {
  const windowStartedAt = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const result = await env.DB.prepare(`
    INSERT INTO api_rate_limits (actor_key, user_id, bucket, window_started_at, request_count)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(actor_key, bucket) DO UPDATE SET
      request_count = CASE WHEN window_started_at = ? THEN request_count + 1 ELSE 1 END,
      window_started_at = ?
    RETURNING request_count
  `).bind(actorKey, userId, bucket, windowStartedAt, windowStartedAt, windowStartedAt).first<{ request_count: number }>();
  if (!result) throw new Error('RATE_LIMIT_UNAVAILABLE');
  return result.request_count;
}

async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
