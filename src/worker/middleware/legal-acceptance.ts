import { CURRENT_LEGAL_VERSIONS } from '@contracts/legal';
import { getUserId } from './session';
import type { Env } from '@env';
import type { MiddlewareHandler } from 'hono';

export const legalAcceptanceRequired: MiddlewareHandler<{ Bindings: Env }> = async (context, next) => {
  const path = new URL(context.req.url).pathname;
  const publicLegalHandshake = ['/api/bootstrap', '/api/bootstrap/', '/api/legal/acceptance'].includes(path);
  const canExerciseRightsOrLeave =
    (context.req.method === 'GET' && ['/api/account/profile', '/api/account/export'].includes(path)) ||
    (context.req.method === 'POST' && path === '/api/account/delete');
  if (publicLegalHandshake || canExerciseRightsOrLeave) return next();

  const userId = getUserId(context as never);
  const accepted = await context.env.DB.prepare(`
    SELECT 1 FROM legal_acceptances
    WHERE user_id = ? AND terms_version = ? AND privacy_version = ?
  `).bind(userId, CURRENT_LEGAL_VERSIONS.terms, CURRENT_LEGAL_VERSIONS.privacy).first();

  if (!accepted) {
    return context.json({
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      message: 'Leé y aceptá la versión vigente de los documentos para usar la aplicación.'
    }, 403);
  }

  await next();
};
