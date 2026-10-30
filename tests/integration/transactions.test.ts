import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createTransaction, listTransactions, updateTransaction, deleteTransaction } from '../../src/worker/application/transactions/transactions';
import { upsertBudget, listBudgets } from '../../src/worker/application/budgets/budgets';
import { initializeUserData } from '../../src/worker/application/bootstrap/initialize-user';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const db = (env as any).DB;

async function seedUser(id: string, email: string) {
  const now = Date.now();
  await db.prepare(`
    INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, ?, ?)
  `).bind(id, 'Test ' + id.slice(0, 4), email, now, now).run();
  await initializeUserData(env as any, id);
}

async function categoryId(userId: string, slug: string): Promise<string> {
  const row = await db.prepare(`SELECT id FROM categories WHERE user_id = ? AND slug = ?`).bind(userId, slug).first();
  return (row as any).id;
}

describe('transactions isolation and sync invariants', () => {
  beforeEach(async () => {
    await db.batch([
      db.prepare(`DELETE FROM transactions`),
      db.prepare(`DELETE FROM budgets`),
      db.prepare(`DELETE FROM categories`),
      db.prepare(`DELETE FROM user_sync_state`),
      db.prepare(`DELETE FROM user_preferences`),
      db.prepare(`DELETE FROM "user"`)
    ]);
    await seedUser(USER_A, 'a@example.com');
    await seedUser(USER_B, 'b@example.com');
  });

  it('creates default categories idempotently', async () => {
    await initializeUserData(env as any, USER_A);
    const rows = await db.prepare(`SELECT COUNT(*) AS n FROM categories WHERE user_id = ?`).bind(USER_A).first();
    const before = (rows as any).n;
    await initializeUserData(env as any, USER_A);
    const rows2 = await db.prepare(`SELECT COUNT(*) AS n FROM categories WHERE user_id = ?`).bind(USER_A).first();
    expect((rows2 as any).n).toBe(before);
    expect(before).toBeGreaterThan(0);
  });

  it('does not leak another user transaction', async () => {
    const catA = await categoryId(USER_A, 'alimentacion');
    const catB = await categoryId(USER_B, 'alimentacion');
    const idA = '11111111-1111-4111-8111-111111111111';
    const idB = '22222222-2222-4222-8222-222222222222';

    await createTransaction(env as any, USER_A, {
      id: idA, kind: 'expense', amountMinor: 1500, currency: 'ARS',
      categoryId: catA, occurredOn: '2026-10-05', note: 'cafe'
    });
    await createTransaction(env as any, USER_B, {
      id: idB, kind: 'expense', amountMinor: 2000, currency: 'ARS',
      categoryId: catB, occurredOn: '2026-10-06'
    });

    const listA = await listTransactions(env as any, USER_A, { page: 1, limit: 50 });
    expect(listA.map(t => t.id)).toEqual([idA]);

    const listB = await listTransactions(env as any, USER_B, { page: 1, limit: 50 });
    expect(listB.map(t => t.id)).toEqual([idB]);
  });

  it('rejects a category owned by another user', async () => {
    const catB = await categoryId(USER_B, 'alimentacion');
    await expect(createTransaction(env as any, USER_A, {
      id: '33333333-3333-4333-8333-333333333333', kind: 'expense', amountMinor: 1000,
      currency: 'ARS', categoryId: catB, occurredOn: '2026-10-05'
    })).rejects.toThrow();
  });

  it('uses optimistic versioning and soft deletes', async () => {
    const catA = await categoryId(USER_A, 'alimentacion');
    const id = '44444444-4444-4444-8444-444444444444';
    const created = await createTransaction(env as any, USER_A, {
      id, kind: 'expense', amountMinor: 1000, currency: 'ARS',
      categoryId: catA, occurredOn: '2026-10-05'
    });
    expect(created.version).toBe(1);

    const updated = await updateTransaction(env as any, USER_A, {
      id, amountMinor: 2500, version: 1
    });
    expect(updated.version).toBe(2);
    expect(updated.amountMinor).toBe(2500);

    await expect(updateTransaction(env as any, USER_A, {
      id, amountMinor: 999, version: 1
    })).rejects.toThrow('CONFLICT');

    await deleteTransaction(env as any, USER_A, id, 2);
    const after = await listTransactions(env as any, USER_A, { page: 1, limit: 50 });
    expect(after.find(t => t.id === id)).toBeUndefined();

    const marker = await (env as any).DELETION_JOURNAL.get(`deleted-transactions/${USER_A}/${id}`);
    expect(marker).not.toBeNull();
  });

  it('computes budget spend per currency and owner', async () => {
    const catA = await categoryId(USER_A, 'alimentacion');
    await createTransaction(env as any, USER_A, {
      id: '55555555-5555-4555-8555-555555555555', kind: 'expense', amountMinor: 30000,
      currency: 'ARS', categoryId: catA, occurredOn: '2026-10-10'
    });
    await createTransaction(env as any, USER_A, {
      id: '66666666-6666-4666-8666-666666666666', kind: 'income', amountMinor: 500000,
      currency: 'ARS', categoryId: await categoryId(USER_A, 'salario'), occurredOn: '2026-10-01'
    });
    await createTransaction(env as any, USER_A, {
      id: '77777777-7777-4777-8777-777777777777', kind: 'expense', amountMinor: 500,
      currency: 'USD', categoryId: catA, occurredOn: '2026-10-11'
    });

    await upsertBudget(env as any, USER_A, {
      id: '88888888-8888-4888-8888-888888888888', categoryId: catA,
      periodMonth: '2026-10', currency: 'ARS', limitMinor: 100000
    });

    const budgets = await listBudgets(env as any, USER_A, '2026-10');
    expect(budgets).toHaveLength(1);
    expect(budgets[0]!.spentMinor).toBe(30000);
    expect(budgets[0]!.remainingMinor).toBe(70000);
    expect(budgets[0]!.isOverBudget).toBe(false);
  });
});