import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { Env } from '@env';
import { bootstrapRoutes } from '../../src/worker/routes/bootstrap';

const USER_ID = '99999999-9999-4999-8999-999999999998';
const EPOCH = '12345678-1234-4234-8234-123456789abc';
const user = {
  id: USER_ID,
  name: 'Bootstrap Test',
  email: 'bootstrap-contract@example.invalid',
  emailVerified: true,
  image: null
};
const db = (env as any).DB;

const app = new Hono<{ Bindings: Env; Variables: { user: typeof user } }>();
app.use('*', async (context, next) => {
  context.set('user', user);
  await next();
});
app.route('/api/bootstrap', bootstrapRoutes);

beforeEach(async () => {
  await db.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, 1, 1)`).bind(USER_ID, user.name, user.email).run();
});

afterEach(async () => {
  await db.prepare(`DELETE FROM "user" WHERE id = ?`).bind(USER_ID).run();
});

describe('bootstrap API contract', () => {
  it('returns client field names and the current sync epoch', async () => {
    const response = await app.fetch(
      new Request('https://finance-pwa.test/api/bootstrap'),
      { ...env, SYNC_EPOCH: EPOCH } as never,
      undefined
    );
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body).toEqual({
      userId: USER_ID,
      syncEpoch: EPOCH,
      defaultCurrency: 'ARS',
      timeZone: 'America/Argentina/Buenos_Aires',
      onboardingComplete: false
    });
  });
});
