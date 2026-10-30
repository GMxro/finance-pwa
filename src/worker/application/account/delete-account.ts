import type { Env } from '@env';

export async function deleteAccount(env: Env, userId: string): Promise<void> {
  const now = Date.now();

  await env.DB.prepare(`
    UPDATE user_preferences SET deletion_pending_at = ?, updated_at = ? WHERE user_id = ?
  `).bind(now, now, userId).run();

  const userMarker = JSON.stringify({ userId, deletedAt: now, type: 'user' });
  await env.DELETION_JOURNAL.put(`deleted-users/${userId}`, userMarker);

  const transactions = await env.DB.prepare(`
    SELECT id FROM transactions WHERE user_id = ? AND deleted_at IS NULL
  `).bind(userId).all();

  for (const transaction of transactions.results) {
    const marker = JSON.stringify({
      id: transaction.id,
      userId,
      deletedAt: now,
      type: 'transaction'
    });
    await env.DELETION_JOURNAL.put(`deleted-transactions/${userId}/${transaction.id}`, marker);
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM transactions WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM budgets WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM categories WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM "session" WHERE "userId" = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM "account" WHERE "userId" = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM "verification" WHERE identifier = (SELECT email FROM "user" WHERE id = ?)`).bind(userId),
    env.DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind(userId)
  ]);
}
