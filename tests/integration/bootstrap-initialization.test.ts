import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { initializeUserData } from '../../src/worker/application/bootstrap/initialize-user';

const db = (env as any).DB;
const USER_ID = '99999999-9999-4999-8999-999999999999';

beforeEach(async () => {
  await db.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Bootstrap Test', 'bootstrap-test@example.invalid', 1, 1, 1)`).bind(USER_ID).run();
});

afterEach(async () => {
  await db.prepare(`DELETE FROM "user" WHERE id = ?`).bind(USER_ID).run();
});

describe('user bootstrap initialization', () => {
  it('is idempotent when multiple authenticated tabs bootstrap at the same time', async () => {
    await Promise.all([
      initializeUserData(env as any, USER_ID),
      initializeUserData(env as any, USER_ID)
    ]);

    const result = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM user_preferences WHERE user_id = ?) AS preferences,
      (SELECT COUNT(*) FROM categories WHERE user_id = ?) AS categories,
      (SELECT COUNT(*) FROM user_sync_state WHERE user_id = ?) AS sync_states
    `).bind(USER_ID, USER_ID, USER_ID).first();

    expect(result).toEqual({ preferences: 1, categories: 13, sync_states: 1 });
  });
});
