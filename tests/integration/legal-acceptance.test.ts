import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import type { Env } from '@env';
import { CURRENT_LEGAL_VERSIONS } from '../../src/contracts/legal';
import { legalAcceptanceRequired } from '../../src/worker/middleware/legal-acceptance';
import { legalRoutes } from '../../src/worker/routes/legal';

const USER_ID = '88888888-8888-4888-8888-888888888881';
const user = { id: USER_ID, name: 'Legal Test', email: 'legal-test@example.invalid', emailVerified: true, image: null };
const db = (env as any).DB;

const api = new Hono<{ Bindings: Env; Variables: { user: typeof user } }>();
api.use('*', async (context, next) => {
  context.set('user', user);
  await next();
});
api.use('*', legalAcceptanceRequired);
api.route('/api/legal', legalRoutes);

const protectedApi = new Hono<{ Bindings: Env; Variables: { user: typeof user } }>();
protectedApi.use('*', async (context, next) => {
  context.set('user', user);
  await next();
});
protectedApi.use('*', legalAcceptanceRequired);
protectedApi.get('/private', (context) => context.text('private data'));
protectedApi.get('/api/account/profile', (context) => context.text('profile'));
protectedApi.get('/api/account/export', (context) => context.text('export'));
protectedApi.post('/api/account/delete', (context) => context.text('deleted'));

beforeEach(async () => {
  await db.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, 1, 1)`).bind(USER_ID, user.name, user.email).run();
});

afterEach(async () => {
  await db.prepare(`DELETE FROM "user" WHERE id = ?`).bind(USER_ID).run();
});

describe('versioned legal acceptance', () => {
  it('requires a deliberate, complete affirmative action before protected data is served', async () => {
    const blocked = await protectedApi.fetch(new Request('https://finance-pwa.test/private'), env as never);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: 'LEGAL_ACCEPTANCE_REQUIRED' });

    const missingConfirmation = await api.fetch(new Request('https://finance-pwa.test/api/legal/acceptance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termsAccepted: true, privacyAcknowledged: true, adultConfirmed: false })
    }), env as never);
    expect(missingConfirmation.status).toBe(400);
    const rejectedRows = await db.prepare(`SELECT COUNT(*) AS count FROM legal_acceptances WHERE user_id = ?`)
      .bind(USER_ID).first<{ count: number }>();
    expect(rejectedRows?.count).toBe(0);

    const accepted = await api.fetch(new Request('https://finance-pwa.test/api/legal/acceptance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termsAccepted: true, privacyAcknowledged: true, adultConfirmed: true })
    }), env as never);
    expect(accepted.status).toBe(200);
    const acceptance = await accepted.json() as Record<string, unknown>;
    expect(acceptance).toMatchObject({
      accepted: true,
      termsVersion: CURRENT_LEGAL_VERSIONS.terms,
      privacyVersion: CURRENT_LEGAL_VERSIONS.privacy
    });
    expect(acceptance.acceptedAt).toEqual(expect.any(Number));

    const allowed = await protectedApi.fetch(new Request('https://finance-pwa.test/private'), env as never);
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe('private data');
  });

  it('keeps personal-data access and account deletion available without current acceptance', async () => {
    for (const [method, path] of [
      ['GET', '/api/account/profile'],
      ['GET', '/api/account/export'],
      ['POST', '/api/account/delete']
    ] as const) {
      const response = await protectedApi.fetch(new Request(`https://finance-pwa.test${path}`, { method }), env as never);
      expect(response.status).toBe(200);
    }
  });

  it('requires re-acceptance when either document version changes and removes acceptances with account deletion', async () => {
    await db.prepare(`INSERT INTO legal_acceptances (user_id, terms_version, privacy_version, accepted_at)
      VALUES (?, '2026-10-30', ?, 1710000000000)`)
      .bind(USER_ID, CURRENT_LEGAL_VERSIONS.privacy).run();

    const response = await api.fetch(new Request('https://finance-pwa.test/api/legal/acceptance'), env as never);
    expect(await response.json()).toMatchObject({ accepted: false, acceptedAt: null });
    const blocked = await protectedApi.fetch(new Request('https://finance-pwa.test/private'), env as never);
    expect(blocked.status).toBe(403);

    await db.prepare(`DELETE FROM "user" WHERE id = ?`).bind(USER_ID).run();
    const remaining = await db.prepare(`SELECT COUNT(*) AS count FROM legal_acceptances WHERE user_id = ?`)
      .bind(USER_ID).first<{ count: number }>();
    expect(remaining?.count).toBe(0);
  });

  it('returns current versions and treats repeat submissions as the same acceptance', async () => {
    const before = await api.fetch(new Request('https://finance-pwa.test/api/legal/acceptance'), env as never);
    expect(await before.json()).toEqual({
      accepted: false,
      termsVersion: CURRENT_LEGAL_VERSIONS.terms,
      privacyVersion: CURRENT_LEGAL_VERSIONS.privacy,
      acceptedAt: null
    });

    const request = () => api.fetch(new Request('https://finance-pwa.test/api/legal/acceptance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termsAccepted: true, privacyAcknowledged: true, adultConfirmed: true })
    }), env as never);
    const first = await (await request()).json() as { acceptedAt: number };
    const second = await (await request()).json() as { acceptedAt: number };

    expect(second.acceptedAt).toBe(first.acceptedAt);
    const rows = await db.prepare(`SELECT COUNT(*) AS count FROM legal_acceptances WHERE user_id = ?`)
      .bind(USER_ID).first<{ count: number }>();
    expect(rows?.count).toBe(1);
  });
});
