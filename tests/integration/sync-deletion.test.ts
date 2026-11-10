import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { pushSync, pullSync } from '../../src/worker/application/sync/sync-engine';
import { deleteAccount, getAccountDeletionStatus } from '../../src/worker/application/account/delete-account';
import { createTransaction, updateTransaction } from '../../src/worker/application/transactions/transactions';
import { createTransfer } from '../../src/worker/application/transfers/transfers';
import { initializeUserData } from '../../src/worker/application/bootstrap/initialize-user';
import { apiMutationRateLimit, consumeRateLimit } from '../../src/worker/middleware/rate-limit';
import { listBudgets, upsertBudget } from '../../src/worker/application/budgets/budgets';
import { listAccounts } from '../../src/worker/application/accounts/accounts';

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
      db.prepare(`DELETE FROM transfers`),
      db.prepare(`DELETE FROM transactions`),
      db.prepare(`DELETE FROM accounts`),
      db.prepare(`DELETE FROM api_rate_limits`),
      db.prepare(`DELETE FROM account_deletion_receipts`),
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

  it('rejects an update payload that violates transaction constraints before writing', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2';
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });

    await expect(pushSync(env as any, USER, [{
      id,
      operationId: 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2',
      userId: USER,
      type: 'update',
      payload: { id, amountMinor: 0 },
      version: 1
    }] as any)).rejects.toThrow('SYNC_INVALID_PAYLOAD');
    const row = await db.prepare(`SELECT amount_minor, version FROM transactions WHERE id = ? AND user_id = ?`).bind(id, USER).first();
    expect(row).toMatchObject({ amount_minor: 1000, version: 1 });
  });

  it('rejects an update that assigns a category of the wrong kind', async () => {
    const expenseCategory = await catId('alimentacion');
    const incomeCategory = await catId('salario');
    const id = 'a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3';
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId: expenseCategory, occurredOn: '2026-10-07'
    });

    const result = await pushSync(env as any, USER, [{
      id,
      operationId: 'b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3',
      userId: USER,
      type: 'update',
      payload: { id, categoryId: incomeCategory },
      version: 1
    }] as any);
    const row = await db.prepare(`SELECT category_id, version FROM transactions WHERE id = ? AND user_id = ?`).bind(id, USER).first();

    expect(result.applied).toBe(0);
    expect(result.conflicts[0]?.error).toBe('CATEGORY_INVALID');
    expect(row).toMatchObject({ category_id: expenseCategory, version: 1 });
  });

  it('rejects an operation ID whose stored entity does not match', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a4a4';
    const operationId = 'b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4';
    const item = {
      id, operationId, userId: USER, type: 'create',
      payload: { id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07' }
    };
    await pushSync(env as any, USER, [item] as any);
    await db.prepare(`UPDATE sync_operations SET entity_id = ? WHERE user_id = ? AND operation_id = ?`)
      .bind('a5a5a5a5-a5a5-45a5-85a5-a5a5a5a5a5a5', USER, operationId).run();

    const result = await pushSync(env as any, USER, [item] as any);
    expect(result.applied).toBe(0);
    expect(result.conflicts[0]?.error).toBe('SYNC_OPERATION_ID_REUSED');
  });

  it('does not treat a reused transfer ID with different data as idempotent', async () => {
    const accounts = await db.prepare(`SELECT id FROM accounts WHERE user_id = ? AND archived_at IS NULL ORDER BY sort_order`)
      .bind(USER).all();
    const [from, to] = accounts.results as Array<{ id: string }>;
    const transfer = {
      id: 'a6a6a6a6-a6a6-46a6-86a6-a6a6a6a6a6a6',
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 1200,
      fromCurrency: 'ARS',
      occurredOn: '2026-10-07'
    } as const;

    const original = await createTransfer(env as any, USER, transfer);
    const replay = await createTransfer(env as any, USER, transfer);
    expect(replay.id).toBe(original.id);
    await expect(createTransfer(env as any, USER, { ...transfer, fromAmountMinor: 1300 }))
      .rejects.toThrow('identificador de transferencia ya se usó');
    const row = await db.prepare(`SELECT from_amount_minor FROM transfers WHERE id = ? AND user_id = ?`)
      .bind(transfer.id, USER).first();
    expect(row).toMatchObject({ from_amount_minor: 1200 });
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

  it('does not confirm an applied update after its expected value was overwritten', async () => {
    const categoryId = await catId('alimentacion');
    const id = 'abababab-abab-4bab-8bab-abababababac';
    const operation = {
      id,
      operationId: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdce',
      userId: USER,
      type: 'update',
      payload: { id, amountMinor: 2500 },
      version: 1
    };
    await createTransaction(env as any, USER, {
      id, kind: 'expense', amountMinor: 1000, currency: 'ARS', categoryId, occurredOn: '2026-10-07'
    });
    await pushSync(env as any, USER, [operation] as any);
    await updateTransaction(env as any, USER, { id, amountMinor: 3000, version: 2 });

    const retry = await pushSync(env as any, USER, [operation] as any);
    const transaction = await db.prepare(`SELECT amount_minor, version FROM transactions WHERE id = ?`).bind(id).first();

    expect(retry.applied).toBe(0);
    expect(retry.conflicts[0]?.error).toBe('SYNC_RESULT_MISSING');
    expect(transaction).toMatchObject({ amount_minor: 3000, version: 3 });
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

    const requestId = 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3';
    await deleteAccount(env as any, USER, requestId);

    const checks = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM user_preferences WHERE user_id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM user_sync_state WHERE user_id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM categories WHERE user_id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM transfers WHERE user_id = ?`).bind(USER).first(),
      db.prepare(`SELECT COUNT(*) AS n FROM "session" WHERE "userId" = ?`).bind(USER).first()
    ]);

    for (const row of checks) expect((row as any).n).toBe(0);

    const userMarker = await (env as any).DELETION_JOURNAL.get(`deleted-users/${USER}`);
    expect(userMarker).not.toBeNull();

    const txMarker = await (env as any).DELETION_JOURNAL.get(`deleted-transactions/${USER}/d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3`);
    expect(txMarker).not.toBeNull();
    expect(await getAccountDeletionStatus(env as any, { requestId })).toEqual({ found: true, completed: true });
    expect(await db.prepare(`SELECT user_id, journal_complete FROM account_deletion_receipts WHERE request_id = ?`)
      .bind(requestId).first()).toMatchObject({ user_id: null, journal_complete: 1 });
    await deleteAccount(env as any, USER, requestId);
  });

  it('atomically counts user requests in fixed windows', async () => {
    const bucket = `test-${crypto.randomUUID()}`;
    const start = 1_800_000_000_000;
    expect(await consumeRateLimit(env as any, `user:${USER}`, USER, bucket, start)).toBe(1);
    expect(await consumeRateLimit(env as any, `user:${USER}`, USER, bucket, start + 10)).toBe(2);
    expect(await consumeRateLimit(env as any, `user:${USER}`, USER, bucket, start + 60_000)).toBe(1);
  });

  it('does not let a different user reuse a completed deletion receipt', async () => {
    const requestId = 'f6f6f6f6-f6f6-46f6-86f6-f6f6f6f6f6f6';
    const otherUser = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await deleteAccount(env as any, USER, requestId);
    await db.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES (?, 'Other', 'other@example.com', 1, ?, ?)`).bind(otherUser, Date.now(), Date.now()).run();

    await expect(deleteAccount(env as any, otherUser, requestId)).rejects.toThrow('identificador de borrado ya fue utilizado');
    expect(await db.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE id = ?`).bind(otherUser).first()).toMatchObject({ n: 1 });
  });

  it('blocks a burst of sync writes after the configured per-user limit', async () => {
    let response: unknown;
    let allowed = 0;
    const c = {
      env,
      req: { method: 'POST', path: '/api/sync/transactions' },
      get: () => ({ id: USER }),
      header: () => {},
      json: (body: unknown, status: number) => { response = { body, status }; return response; }
    } as any;

    for (let index = 0; index < 21; index++) {
      await apiMutationRateLimit(c, async () => { allowed++; });
    }

    expect(allowed).toBe(20);
    expect(response).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED' } });
  });

  it('rejects an expense that would exceed the exact aggregate budget range', async () => {
    const categoryId = await catId('alimentacion');
    await upsertBudget(env as any, USER, {
      id: 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1',
      categoryId, periodMonth: '2026-10', currency: 'ARS', limitMinor: 100
    });
    await createTransaction(env as any, USER, {
      id: 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2', kind: 'expense', amountMinor: 999999999999,
      currency: 'ARS', categoryId, occurredOn: '2026-10-01'
    });
    await expect(createTransaction(env as any, USER, {
      id: 'e3e3e3e3-e3e3-43e3-83e3-e3e3e3e3e3e3', kind: 'expense', amountMinor: 1,
      currency: 'ARS', categoryId, occurredOn: '2026-10-02'
    })).rejects.toThrow('rango exacto');

    const budgets = await listBudgets(env as any, USER, '2026-10');
    expect(budgets[0]).toMatchObject({ spentMinor: 999999999999 });
  });

  it('rejects an income that would exceed the exact account balance range', async () => {
    const categoryId = await catId('salario');
    await createTransaction(env as any, USER, {
      id: 'e4e4e4e4-e4e4-44e4-84e4-e4e4e4e4e4e4', kind: 'income', amountMinor: 999999999999,
      currency: 'ARS', categoryId, occurredOn: '2026-10-01'
    });
    await expect(createTransaction(env as any, USER, {
      id: 'e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5', kind: 'income', amountMinor: 1,
      currency: 'ARS', categoryId, occurredOn: '2026-10-02'
    })).rejects.toThrow('rango exacto');

    const accounts = await listAccounts(env as any, USER);
    expect(accounts.some((account) => account.balances.some((balance) => balance.amountMinor === 999999999999))).toBe(true);
  });

  it('does not acknowledge an offline create that would overflow aggregate totals', async () => {
    const categoryId = await catId('alimentacion');
    await createTransaction(env as any, USER, {
      id: 'ea0ea0ea-0ea0-4ea0-8ea0-ea0ea0ea0ea0', kind: 'expense', amountMinor: 999999999999,
      currency: 'ARS', categoryId, occurredOn: '2026-10-01'
    });
    const item = {
      id: 'ea1ea1ea-1ea1-41ea-81ea-1ea1ea1ea1ea',
      operationId: 'eb1eb1eb-1eb1-41eb-81eb-1eb1eb1eb1eb',
      userId: USER,
      type: 'create',
      payload: {
        id: 'ea1ea1ea-1ea1-41ea-81ea-1ea1ea1ea1ea', kind: 'expense', amountMinor: 1,
        currency: 'ARS', categoryId, occurredOn: '2026-10-02'
      }
    };

    const result = await pushSync(env as any, USER, [item] as any);
    const row = await db.prepare(`SELECT id FROM transactions WHERE id = ? AND user_id = ?`).bind(item.id, USER).first();
    expect(result.applied).toBe(0);
    expect(result.appliedOperationIds).toEqual([]);
    expect(result.conflicts[0]?.error).toBe('FINANCIAL_RANGE_EXCEEDED');
    expect(row).toBeNull();
  });

  it('rejects a transfer whose two same-currency legs exceed the total exact range', async () => {
    const rows = await db.prepare(`SELECT id FROM accounts WHERE user_id = ? ORDER BY sort_order`).bind(USER).all();
    const [from, to] = rows.results as Array<{ id: string }>;
    await expect(createTransfer(env as any, USER, {
      id: 'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6',
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 999999999999,
      fromCurrency: 'ARS',
      occurredOn: '2026-10-01'
    })).rejects.toThrow('rango exacto');
  });

  it('fails explicitly when legacy stored rows already exceed aggregate precision', async () => {
    const categoryId = await catId('alimentacion');
    const account = await db.prepare(`SELECT id FROM accounts WHERE user_id = ? AND is_default = 1`).bind(USER).first<{ id: string }>();
    await upsertBudget(env as any, USER, {
      id: 'e7e7e7e7-e7e7-47e7-87e7-e7e7e7e7e7e7',
      categoryId, periodMonth: '2026-10', currency: 'ARS', limitMinor: 100
    });
    await createTransaction(env as any, USER, {
      id: 'e8e8e8e8-e8e8-48e8-88e8-e8e8e8e8e8e8', kind: 'expense', amountMinor: 999999999999,
      currency: 'ARS', categoryId, occurredOn: '2026-10-01'
    });
    await db.prepare(`INSERT INTO transactions
      (id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, version, change_seq, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'expense', 2, 'ARS', '2026-10-02', 1, 99, ?, ?)`)
      .bind('e9e9e9e9-e9e9-49e9-89e9-e9e9e9e9e9e9', USER, categoryId, account!.id, Date.now(), Date.now()).run();

    await expect(listBudgets(env as any, USER, '2026-10')).rejects.toThrow('rango exacto');
    await expect(listAccounts(env as any, USER)).rejects.toThrow('rango exacto');
  });

  it('recovers a committed account deletion after an R2 journal page fails', async () => {
    const categoryId = await catId('alimentacion');
    await createTransaction(env as any, USER, {
      id: 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4', kind: 'expense', amountMinor: 7000,
      currency: 'ARS', categoryId, occurredOn: '2026-10-09'
    });
    let writes = 0;
    const failingEnv = {
      ...env,
      DELETION_JOURNAL: {
        put: async (key: string, value: string) => {
          writes++;
          if (writes === 2) throw new Error('injected R2 failure');
          return (env as any).DELETION_JOURNAL.put(key, value);
        },
        delete: async (key: string) => (env as any).DELETION_JOURNAL.delete(key)
      }
    };
    const requestId = 'f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f4f4';

    await expect(deleteAccount(failingEnv as any, USER, requestId)).rejects.toThrow('injected R2 failure');
    expect(await db.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE id = ?`).bind(USER).first()).toMatchObject({ n: 0 });
    expect(await db.prepare(`SELECT journal_complete, user_id FROM account_deletion_receipts WHERE request_id = ?`)
      .bind(requestId).first()).toMatchObject({ journal_complete: 0, user_id: USER });

    expect(await getAccountDeletionStatus(env as any, { userId: USER })).toEqual({ found: true, completed: true });
    await deleteAccount(env as any, USER, requestId);
    expect(await (env as any).DELETION_JOURNAL.get(`deleted-users/${USER}`)).not.toBeNull();
  });

  it('leaves the D1 deletion atomic and retryable when its batch fails', async () => {
    const requestId = 'f5f5f5f5-f5f5-45f5-85f5-f5f5f5f5f5f5';
    const failingDb = new Proxy((env as any).DB, {
      get(target, property) {
        if (property === 'batch') return async () => { throw new Error('injected D1 failure'); };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });

    await expect(deleteAccount({ ...(env as any), DB: failingDb }, USER, requestId)).rejects.toThrow('injected D1 failure');
    expect(await db.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE id = ?`).bind(USER).first()).toMatchObject({ n: 1 });
    expect(await getAccountDeletionStatus(env as any, { requestId })).toEqual({ found: false, completed: false });
    let blocked: unknown;
    await apiMutationRateLimit({
      env,
      req: { method: 'POST', path: '/api/transactions' },
      get: () => ({ id: USER }),
      header: () => {},
      json: (body: unknown, status: number) => { blocked = { body, status }; return blocked; }
    } as any, async () => { throw new Error('mutation should be blocked while deletion is pending'); });
    expect(blocked).toMatchObject({ status: 409, body: { code: 'ACCOUNT_DELETION_PENDING' } });

    await deleteAccount(env as any, USER, requestId);
    expect(await getAccountDeletionStatus(env as any, { requestId })).toEqual({ found: true, completed: true });
  });

  it('continues a large deletion journal from its persisted cursor', async () => {
    const categoryId = await catId('alimentacion');
    const account = await db.prepare(`SELECT id FROM accounts WHERE user_id = ? AND is_default = 1`).bind(USER).first<{ id: string }>();
    const now = Date.now();
    await db.prepare(`
      WITH RECURSIVE numbers(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < 401
      )
      INSERT INTO transactions
        (id, user_id, category_id, account_id, kind, amount_minor, currency_code, occurred_on, version, change_seq, created_at, updated_at)
      SELECT printf('bulk-%04d', n), ?, ?, ?, 'expense', 1, 'ARS', '2026-10-01', 1, n, ?, ? FROM numbers
    `).bind(USER, categoryId, account!.id, now, now).run();
    const requestId = 'f7f7f7f7-f7f7-47f7-87f7-f7f7f7f7f7f7';

    const first = await deleteAccount(env as any, USER, requestId);
    expect(first).toEqual({ completed: false });
    expect(await db.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE id = ?`).bind(USER).first()).toMatchObject({ n: 0 });
    expect(await db.prepare(`SELECT journal_cursor, journal_complete FROM account_deletion_receipts WHERE request_id = ?`)
      .bind(requestId).first()).toMatchObject({ journal_complete: 0 });

    expect(await getAccountDeletionStatus(env as any, { requestId })).toEqual({ found: true, completed: true });
    expect(await (env as any).DELETION_JOURNAL.get(`deleted-transactions/${USER}/bulk-0401`)).not.toBeNull();
    expect(await db.prepare(`SELECT COUNT(*) AS n FROM account_deletion_items WHERE request_id = ?`).bind(requestId).first())
      .toMatchObject({ n: 0 });
  });
});
