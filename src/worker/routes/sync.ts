// Sync routes
import { Hono } from 'hono';
import { z } from 'zod';
import { syncPushSchema } from '@contracts/sync';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import { pushSync, pullSync } from '../application/sync/sync-engine';

const syncRoutes = new Hono<{ Bindings: Env }>();

const pullQuerySchema = z.object({
  epoch: z.string().uuid(),
  after: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().positive().max(500).default(100)
});

syncRoutes.get('/transactions', async (c) => {
  const userId = getUserId(c);
  const query = c.req.query();
  
  const result = pullQuerySchema.safeParse({
    epoch: query.epoch,
    after: query.after ? parseInt(query.after) : 0,
    limit: query.limit ? parseInt(query.limit) : 100
  });
  
  if (!result.success) {
    throw new ValidationError('Parámetros inválidos', result.error.flatten());
  }
  
  if (result.data.epoch !== c.env.SYNC_EPOCH) {
    return c.json({ 
      code: 'SYNC_EPOCH_CHANGED', 
      message: 'Epoch de sincronización cambiado, reconstruya la copia local' 
    }, 409);
  }
  
  const syncData = await pullSync(c.env, userId, result.data.after, result.data.limit);
  return c.json(syncData);
});

syncRoutes.post('/transactions', async (c) => {
  const userId = getUserId(c);
  const contentLength = Number(c.req.header('content-length') ?? 0);
  if (contentLength > 256 * 1024) {
    return c.json({ code: 'PAYLOAD_TOO_LARGE', message: 'El lote de sincronización supera el tamaño permitido.' }, 413);
  }
  const text = await c.req.text();
  if (text.length > 256 * 1024) {
    return c.json({ code: 'PAYLOAD_TOO_LARGE', message: 'El lote de sincronización supera el tamaño permitido.' }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ValidationError('El cuerpo debe ser JSON válido.');
  }
  const result = syncPushSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  if (result.data.epoch !== c.env.SYNC_EPOCH) {
    return c.json({ 
      code: 'SYNC_EPOCH_CHANGED', 
      message: 'Epoch de sincronización cambiado, reconstruya la copia local' 
    }, 409);
  }

  let syncResult;
  try {
    syncResult = await pushSync(c.env, userId, result.data.items);
  } catch (error) {
    if (error instanceof Error && error.message === 'SYNC_USER_MISMATCH') {
      return c.json({ code: 'SYNC_USER_MISMATCH', message: 'La operación pertenece a otra cuenta.' }, 403);
    }
    if (error instanceof Error && ['SYNC_INVALID_PAYLOAD', 'SYNC_DUPLICATE_OPERATION_ID'].includes(error.message)) {
      return c.json({ code: error.message, message: 'El lote contiene operaciones inválidas.' }, 400);
    }
    throw error;
  }
  if (syncResult.conflicts.some((conflict) => conflict.error === 'MARKER_FAILED')) {
    return c.json({ code: 'MARKER_FAILED', message: 'No pudimos guardar el registro de borrado. Reintentá la sincronización.' }, 503);
  }
  if (syncResult.conflicts.some((conflict) => conflict.error === 'SYNC_OPERATION_ID_REUSED')) {
    return c.json({ code: 'SYNC_OPERATION_ID_REUSED', message: 'El identificador de operación ya se usó con otros datos.' }, 409);
  }
  if (syncResult.conflicts.some((conflict) => conflict.error === 'SYNC_ITEM_ID_MISMATCH')) {
    return c.json({ code: 'SYNC_ITEM_ID_MISMATCH', message: 'El identificador de la entidad no coincide con la operación.' }, 400);
  }

  return c.json(syncResult);
});

export { syncRoutes };
