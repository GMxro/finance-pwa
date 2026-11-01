import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '@env';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import { acceptCurrentLegalDocuments, getLegalAcceptance } from '../application/legal/legal-acceptance';

const legalAcceptanceSchema = z.object({
  termsAccepted: z.literal(true),
  privacyAcknowledged: z.literal(true),
  adultConfirmed: z.literal(true)
}).strict();

export const legalRoutes = new Hono<{ Bindings: Env }>();

legalRoutes.get('/acceptance', async (context) => {
  const acceptance = await getLegalAcceptance(context.env, getUserId(context));
  return context.json(acceptance, 200, { 'Cache-Control': 'no-store' });
});

legalRoutes.post('/acceptance', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = legalAcceptanceSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Confirmá la mayoría de edad y la lectura y aceptación de los documentos.');

  const acceptance = await acceptCurrentLegalDocuments(context.env, getUserId(context));
  return context.json(acceptance, 200, { 'Cache-Control': 'no-store' });
});
