import { Hono } from 'hono';
import type { Env } from '@env';
import { getUserId } from '../middleware/session';
import { initializeUserData } from '../application/bootstrap/initialize-user';
import { ARGENTINA_TZ } from '@domain/date';

const bootstrapRoutes = new Hono<{ Bindings: Env }>();

bootstrapRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  await initializeUserData(c.env, userId);
  const [preferences, onboarding] = await Promise.all([
    c.env.DB.prepare(`SELECT default_currency, time_zone FROM user_preferences WHERE user_id = ?`)
      .bind(userId).first<{ default_currency: 'ARS' | 'USD'; time_zone: string }>(),
    c.env.DB.prepare(`SELECT completed_at FROM user_onboarding WHERE user_id = ?`)
      .bind(userId).first<{ completed_at: number | null }>()
  ]);
  return c.json({
    userId,
    syncEpoch: c.env.SYNC_EPOCH,
    defaultCurrency: preferences?.default_currency ?? 'ARS',
    timeZone: preferences?.time_zone ?? ARGENTINA_TZ,
    onboardingComplete: onboarding?.completed_at != null
  });
});

export { bootstrapRoutes };
