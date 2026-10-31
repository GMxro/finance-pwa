import { getAuth } from '../auth/auth';
import type { Env } from '@env';

export const sessionMiddleware = async (c: any, next: any) => {
  const authInstance = getAuth(c.env as Env);
  const session = await authInstance.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Sesión requerida' }, 401);
  }

  c.set('user', session.user);
  c.set('session', session.session);
  return next();
};

export function getUserId(c: any): string {
  const user = c.get('user');
  if (!user?.id) throw new Error('Usuario no autenticado');
  return user.id;
}
