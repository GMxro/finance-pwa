import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { pushSync, pullSync } from '../../src/worker/application/sync/sync-engine';
import { deleteAccount } from '../../src/worker/application/account/delete-account';
import { createTransaction } from '../../src/worker/application/transactions/transactions';
import { initializeUserData } from '../../src/worker/application/bootstrap/initialize-user';

const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const db = (env as any).DB;

async function seed() {
  const now = Date.now();
  await db.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Sync User', 'sync@example.com', 1, ?, ?)`).bind(USER, now, now).run();
  await initializeUserData(env as any, USER);
}

async function catId(slug: string) {
  const row = await db.prepare(`SELECT id FROM categories WHERE user_id = ? AND slug = ?`).bind(USER, slug).first();
  return (row as any).id;
}

describe('sync engine and account deletion', () => {
  beforeEach(async () => {
    await db.batch([
      db.prepare(`DELETE FROM transactions`),
      db.prepare(`DELETE FROM sync_operations`),
      db.prepare(`DELETE FROM budgets`),
      db.prepare(`DELETE FROM categories`),
      db.prepare(`DELETE FROM user_sync_state`),
      db.prepare(`DELETE FROM user_preferences`),
      db.prepare(`DELETE FROM "session"`),
      db.prepare(`DELETE FROM "account"`),
      db.prepare(`DELETE FROM "verification"`),
      db.prepare(`DELETE FROM "user"`)
    ]);
    await seed();
  });

  it('is idempotent when the same create is pushed twice', async () => {
    const categoryId = await catId('alimentacion');
    const payload = {
      id: '99999999-9999-4999-8999-999999999999',
      kind: 'expense',
      amountMinor: 4500,
      currency: 'ARS',
      categoryId,
      occurredOn: '2026-10-07'
    };

    const operation = { id: payload.id, operationId: '10101010-1010-4010-8010-101010101010', userId: USER, type: 'create' as const, payload };
    const first = await pushSync(env as any, USER, [operation]);
    expect(first.applied).toBe(1);
    expect(first.conflicts).toHaveLength(0);

    const second = await pushSync(env as any, USER, [operation]);
    expect(second.applied).toBe(1);
    expect(second.conflicts).toHaveLength(0);

    const count = await db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?`).bind(USER).first();
    expect((count as any).n).toBe(1);
  });

  it('reports a conflict for the same id with different content', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
    const payload = { id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07' };

    await pushSync(env as any, USER, [{ id, operationId: '20202020-2020-4020-8020-202020202020', userId: USER, type: 'create', payload }]);
    const result = await pushSync(env as any, USER, [{
      id,
      operationId: '30303030-3030-4030-8030-303030303030',
      userId: USER,
      type: 'create',
      payload: { ...payload, amountMinor: 9999 }
    }]);

    expect(result.applied).toBe(0);
    expect(result.conflicts[0]?.error).toBe('CONFLICT');
  });

  it('ignores a repeated update operation ID after the first request succeeds', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'abababab-abab-4bab-8bab-abababababab';
    const operationId = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });
    const operation = {
      id,
      operationId,
      userId: USER,
      type: 'update',
      payload: { id, amountMinor: 2500 },
      version: 1
    };

    const first = await pushSync(env as any, USER, [operation] as any);
    const retry = await pushSync(env as any, USER, [operation] as any);
    const transaction = await db.prepare(`SELECT amount_minor, version FROM transactions WHERE id = ?`).bind(id).first();

    expect(first.applied).toBe(1);
    expect(retry.applied).toBe(1);
    expect(retry.conflicts).toHaveLength(0);
    expect(transaction).toMatchObject({ amount_minor: 2500, version: 2 });
  });

  it('records a create once for a repeated outbox operation ID', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'abab0000-abab-4000-8000-abababababab';
    const operationId = 'cdcd0000-cdcd-4000-8000-cdcdcdcdcdcd';
    const item = {
      id,
      operationId,
      userId: USER,
      type: 'create',
      payload: { id, kind: 'expense', amountMinor: 2800, currency: 'ARS', categoryId, occurredOn: '2026-10-07' }
    };

    const first = await pushSync(env as any, USER, [item] as any);
    const retry = await pushSync(env as any, USER, [item] as any);
    const transactionCount = await db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE id = ? AND user_id = ?`).bind(id, USER).first();
    const operationCount = await db.prepare(`SELECT COUNT(*) AS n FROM sync_operations WHERE user_id = ? AND operation_id = ?`).bind(USER, operationId).first();

    expect(first.applied).toBe(1);
    expect(retry.applied).toBe(1);
    expect(retry.conflicts).toHaveLength(0);
    expect((transactionCount as any).n).toBe(1);
    expect((operationCount as any).n).toBe(1);
  });

  it('does not duplicate a create when two retries arrive concurrently', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'abab1111-abab-4111-8111-abababababab';
    const operation = {
      id,
      operationId: 'cdcd1111-cdcd-4111-8111-cdcdcdcdcdcd',
      userId: USER,
      type: 'create',
      payload: { id, kind: 'expense', amountMinor: 3100, currency: 'ARS', categoryId, occurredOn: '2026-10-07' }
    };

    const results = await Promise.all([
      pushSync(env as any, USER, [operation] as any),
      pushSync(env as any, USER, [operation] as any)
    ]);
    const transactionCount = await db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE id = ? AND user_id = ?`).bind(id, USER).first();
    const operationCount = await db.prepare(`SELECT COUNT(*) AS n FROM sync_operations WHERE user_id = ? AND operation_id = ?`).bind(USER, operation.operationId).first();

    expect(results.map((result) => result.applied)).toEqual([1, 1]);
    expect(results.every((result) => result.conflicts.length === 0)).toBe(true);
    expect((transactionCount as any).n).toBe(1);
    expect((operationCount as any).n).toBe(1);
  });

  it('does not apply a concurrent update retry more than once', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'abab2222-abab-4222-8222-abababababab';
    const operation = {
      id,
      operationId: 'cdcd2222-cdcd-4222-8222-cdcdcdcdcdcd',
      userId: USER,
      type: 'update',
      payload: { id, amountMinor: 4200 },
      version: 1
    };
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });

    const results = await Promise.all([
      pushSync(env as any, USER, [operation] as any),
      pushSync(env as any, USER, [operation] as any)
    ]);
    const transaction = await db.prepare(`SELECT amount_minor, version FROM transactions WHERE id = ? AND user_id = ?`).bind(id, USER).first();
    const operationCount = await db.prepare(`SELECT COUNT(*) AS n FROM sync_operations WHERE user_id = ? AND operation_id = ?`).bind(USER, operation.operationId).first();

    expect(results.map((result) => result.applied)).toEqual([1, 1]);
    expect(results.every((result) => result.conflicts.length === 0)).toBe(true);
    expect(transaction).toMatchObject({ amount_minor: 4200, version: 2 });
    expect((operationCount as any).n).toBe(1);
  });

  it('keeps the sync cursor monotonic for concurrent distinct updates', async () => {
    const categoryId = await catId('alimentacion');
    const idA = 'abab3333-abab-4333-8333-abababababab';
    const idB = 'abab4444-abab-4444-8444-abababababab';
    await createTransaction(env as any, USER, {
      id: idA, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });
    await createTransaction(env as any, USER, {
      id: idB, kind: 'expense', amountMinor: 1200, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });

    const [first, second] = await Promise.all([
      pushSync(env as any, USER, [{
        id: idA, operationId: 'cdcd3333-cdcd-4333-8333-cdcdcdcdcdcd', userId: USER,
        type: 'update', payload: { id: idA, amountMinor: 2100 }, version: 1
      }]),
      pushSync(env as any, USER, [{
        id: idB, operationId: 'cdcd4444-cdcd-4444-8444-cdcdcdcdcdcd', userId: USER,
        type: 'update', payload: { id: idB, amountMinor: 2200 }, version: 1
      }])
    ]);
    const rows = await db.prepare(`SELECT change_seq FROM transactions WHERE user_id = ? AND id IN (?, ?) ORDER BY change_seq`).bind(USER, idA, idB).all();
    const state = await db.prepare(`SELECT sequence FROM user_sync_state WHERE user_id = ?`).bind(USER).first();
    const changeSequences = (rows.results as any[]).map((row) => row.change_seq);

    expect(first.applied + second.applied).toBe(2);
    expect(changeSequences).toHaveLength(2);
    expect(new Set(changeSequences).size).toBe(2);
    expect((state as any).sequence).toBe(Math.max(...changeSequences));
  });

  it('keeps the deletion journal timestamp aligned after concurrent delete retries', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'abab5555-abab-4555-8555-abababababab';
    const operationId = 'cdcd5555-cdcd-4555-8555-cdcdcdcdcdcd';
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 500, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });
    const operation = { id, operationId, userId: USER, type: 'delete', payload: { id }, version: 1 };

    await Promise.all([
      pushSync(env as any, USER, [operation] as any),
      pushSync(env as any, USER, [operation] as any)
    ]);
    const transaction = await db.prepare(`SELECT deleted_at FROM transactions WHERE id = ? AND user_id = ?`).bind(id, USER).first();
    const marker = await (env as any).DELETION_JOURNAL.get(`deleted-transactions/${USER}/${id}`);
    const markerData = await marker.json() as { deletedAt: number };

    expect(markerData.deletedAt).toBe((transaction as any).deleted_at);
  });

  it('keeps the deletion journal aligned when a duplicate marker write races the winning D1 delete', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'abab6666-abab-4666-8666-abababababab';
    const operation = {
      id,
      operationId: 'cdcd6666-cdcd-4666-8666-cdcdcdcdcdcd',
      userId: USER,
      type: 'delete',
      payload: { id },
      version: 1
    };
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 600, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });

    const journal = (env as any).DELETION_JOURNAL;
    const originalPut = journal.put.bind(journal);
    let signalFirstPut!: () => void;
    let releaseFirstPut!: () => void;
    let firstPut = true;
    const firstStarted = new Promise<void>((resolve) => { signalFirstPut = resolve; });
    const firstGate = new Promise<void>((resolve) => { releaseFirstPut = resolve; });
    const delayedJournal = {
      get: journal.get.bind(journal),
      put: async (...args: any[]) => {
        if (firstPut) {
          firstPut = false;
          signalFirstPut();
          await firstGate;
        }
        return originalPut(...args);
      }
    };
    const delayedEnv = { ...env, DELETION_JOURNAL: delayedJournal } as any;
    const originalNow = Date.now;
    let timestamp = 1000;
    Date.now = () => timestamp++;

    try {
      const delayed = pushSync(delayedEnv, USER, [operation] as any);
      await firstStarted;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const winner = await pushSync(env as any, USER, [operation] as any);
      releaseFirstPut();
      await Promise.all([delayed, winner]);
    } finally {
      releaseFirstPut();
      Date.now = originalNow;
    }

    const transaction = await db.prepare(`SELECT deleted_at FROM transactions WHERE id = ? AND user_id = ?`).bind(id, USER).first();
    const marker = await journal.get(`deleted-transactions/${USER}/${id}`);
    const markerData = await marker.json() as { deletedAt: number };
    expect(markerData.deletedAt).toBe((transaction as any).deleted_at);
  });

  it('rejects reuse of an operation ID with different content', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'dededede-dede-4ede-8ede-dededededede';
    const operationId = 'efefefef-efef-4fef-8fef-efefefefefef';
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });
    const first = {
      id, operationId, userId: USER, type: 'update',
      payload: { id, amountMinor: 2500 }, version: 1
    };
    await pushSync(env as any, USER, [first] as any);

    const reused = await pushSync(env as any, USER, [{
      ...first, payload: { id, amountMinor: 9999 }, version: 2
    }] as any);
    const transaction = await db.prepare(`SELECT amount_minor, version FROM transactions WHERE id = ?`).bind(id).first();

    expect(reused.applied).toBe(0);
    expect(reused.conflicts[0]?.error).toBe('SYNC_OPERATION_ID_REUSED');
    expect(transaction).toMatchObject({ amount_minor: 2500, version: 2 });
  });

  it('rejects an operation owned by another user without writing it', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1';
    await expect(pushSync(env as any, USER, [{
      id,
      operationId: 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2',
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      type: 'create',
      payload: { id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07' }
    }] as any)).rejects.toThrow('SYNC_USER_MISMATCH');

    const count = await db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE id = ?`).bind(id).first();
    expect((count as any).n).toBe(0);
  });

  it('serves tombstones after a delete', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });

    const before = await pullSync(env as any, USER, 0, 100);
    const version = before.transactions[0]!.version;

    const pushed = await pushSync(env as any, USER, [{
      id,
      operationId: '40404040-4040-4040-8040-404040404040',
      userId: USER,
      type: 'delete',
      payload: { id },
      version
    }]);
    expect(pushed.conflicts).toHaveLength(0);

    const after = await pullSync(env as any, USER, 0, 100);
    expect(after.tombstones.map(t => t.id)).toContain(id);
  });

  it('deletes a full account and leaves no financial rows', async () => {
    const categoryId = await catId('alimentacion');
    await createTransaction(env as any, USER, {
      id: 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3', kind: 'expense', amountMinor: 7000,
      currency: 'ARS', categoryId, occurredOn: '2026-10-09'
    });

    await deleteAccount(env as any, USER);

    const checks = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM user_preferences WHERE user_id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM user_sync_state WHERE user_id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM categories WHERE user_id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM "session" WHERE "userId" = ?`).bind(USER).first()
    ]);

    for (const row of checks) expect((row as any).n).toBe(0);

    const userMarker = await (env as any).DELETION_JOURNAL.get(`deleted-users/${USER}`);
    expect(userMarker).not.toBeNull();

    const txMarker = await (env as any).DELETION_JOURNAL.get(`deleted-transactions/${USER}/d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3`);
    expect(txMarker).not.toBeNull();
  });
});
