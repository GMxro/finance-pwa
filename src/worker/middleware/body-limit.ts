import type { Context, Next } from 'hono';
import type { Env } from '@env';

const MAX_API_BODY_BYTES = 1_048_576;

export async function apiBodyLimit(c: Context<{ Bindings: Env }>, next: Next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || !c.req.raw.body) return next();

  const contentLength = Number(c.req.header('content-length') ?? 0);
  if (contentLength > MAX_API_BODY_BYTES) return oversized(c);

  const reader = c.req.raw.clone().body?.getReader();
  if (!reader) return next();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_API_BODY_BYTES) {
        await reader.cancel();
        return oversized(c);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return next();
}

function oversized(c: Context<{ Bindings: Env }>) {
  return c.json({ code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo de la solicitud supera el tamaño permitido.' }, 413);
}
