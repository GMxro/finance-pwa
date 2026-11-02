import type { Context, Next } from 'hono';
import type { Env } from '@env';

type Version = [number, number, number];

function parseVersion(value: string | undefined): Version | null {
  const match = value?.trim().match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match) return null;
  const version: Version = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!version.every(Number.isSafeInteger)) return null;
  return version;
}

function compareVersions(left: Version, right: Version): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

export async function minimumAppVersion(c: Context<{ Bindings: Env }>, next: Next) {
  const minimum = c.env.MIN_APP_VERSION?.trim();
  if (!minimum) return next();
  if (c.req.method === 'OPTIONS') return next();
  if (c.req.path.startsWith('/api/auth/')) return next();

  const minimumVersion = parseVersion(minimum);
  if (!minimumVersion) {
    c.header('Cache-Control', 'no-store');
    return c.json({ code: 'VERSION_POLICY_INVALID', message: 'La política de versión no es válida.' }, 503);
  }

  const clientVersion = parseVersion(c.req.header('X-App-Version'));
  if (!clientVersion || compareVersions(clientVersion, minimumVersion) < 0) {
    c.header('Cache-Control', 'no-store');
    return c.json({
      code: 'UPDATE_REQUIRED',
      message: 'Actualizá la aplicación para seguir usando tus datos.',
      minimumVersion: minimum
    }, 426);
  }

  return next();
}
