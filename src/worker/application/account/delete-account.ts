import type { Env } from '@env';
import { ConflictError } from '../../middleware/error-handler';

const JOURNAL_PAGE_SIZE = 400;

interface DeletionReceipt {
  request_id: string;
  owner_binding: string;
  owner_hash: string;
  user_id: string | null;
  journal_cursor: string | null;
  journal_complete: number;
  completed_at: number;
}

export async function deleteAccount(env: Env, userId: string, requestId: string): Promise<{ completed: boolean }> {
  const ownerBinding = await deletionOwnerBinding(userId, requestId);
  const ownerHash = await hashValue(userId);
  const receipt = await getReceipt(env, requestId);
  if (receipt) {
    if (receipt.owner_binding !== ownerBinding) throw new ConflictError('El identificador de borrado ya fue utilizado.');
    return receipt.journal_complete ? { completed: true } : finalizeDeletionJournal(env, requestId, receipt);
  }

  const deletedAt = Date.now();
  await env.DB.prepare(`
    UPDATE user_preferences SET deletion_pending_at = COALESCE(deletion_pending_at, ?), updated_at = ? WHERE user_id = ?
  `).bind(deletedAt, deletedAt, userId).run();

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO account_deletion_receipts (request_id, owner_binding, owner_hash, user_id, journal_cursor, journal_complete, completed_at)
        VALUES (?, ?, ?, ?, NULL, 0, ?)
      `).bind(requestId, ownerBinding, ownerHash, userId, deletedAt),
      env.DB.prepare(`
        INSERT INTO account_deletion_items (request_id, transaction_id, deleted_at)
        SELECT ?, id, COALESCE(deleted_at, ?) FROM transactions WHERE user_id = ?
      `).bind(requestId, deletedAt, userId),
      env.DB.prepare(`DELETE FROM transfers WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM transactions WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM budgets WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM categories WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM accounts WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM sync_operations WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM api_rate_limits WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM user_sync_state WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM user_preferences WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM "session" WHERE "userId" = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM "account" WHERE "userId" = ?`).bind(userId),
      env.DB.prepare(`DELETE FROM "verification" WHERE identifier = (SELECT email FROM "user" WHERE id = ?)`).bind(userId),
      env.DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind(userId)
    ]);
  } catch (error) {
    const retryReceipt = await getReceipt(env, requestId);
    if (retryReceipt?.owner_binding === ownerBinding) {
      return retryReceipt.journal_complete ? { completed: true } : finalizeDeletionJournal(env, requestId, retryReceipt);
    }
    if (retryReceipt) throw new ConflictError('El identificador de borrado ya fue utilizado.');
    throw error;
  }

  const committedReceipt = await getReceipt(env, requestId);
  if (!committedReceipt || committedReceipt.owner_binding !== ownerBinding) {
    throw new Error('ACCOUNT_DELETION_RECEIPT_MISSING');
  }
  return finalizeDeletionJournal(env, requestId, committedReceipt);
}

export async function getAccountDeletionStatus(
  env: Env,
  lookup: { requestId: string } | { userId: string }
): Promise<{ found: boolean; completed: boolean }> {
  const receipt = 'requestId' in lookup
    ? await getReceipt(env, lookup.requestId)
    : await env.DB.prepare(`
      SELECT request_id, owner_binding, owner_hash, user_id, journal_cursor, journal_complete, completed_at
      FROM account_deletion_receipts WHERE owner_hash = ? ORDER BY journal_complete ASC, completed_at DESC LIMIT 1
    `).bind(await hashValue(lookup.userId)).first<DeletionReceipt & { request_id: string }>();
  if (!receipt) return { found: false, completed: false };
  if (receipt.journal_complete) return { found: true, completed: true };
  return { found: true, ...await finalizeDeletionJournal(env, receipt.request_id, receipt) };
}

async function finalizeDeletionJournal(
  env: Env,
  requestId: string,
  receipt: DeletionReceipt
): Promise<{ completed: boolean }> {
  if (receipt.journal_complete) return { completed: true };
  const userId = receipt.user_id;
  if (!userId) throw new Error('ACCOUNT_DELETION_JOURNAL_STATE_INVALID');

  const items = await env.DB.prepare(`
    SELECT transaction_id, deleted_at FROM account_deletion_items
    WHERE request_id = ? AND (? IS NULL OR transaction_id > ?)
    ORDER BY transaction_id ASC LIMIT ?
  `).bind(requestId, receipt.journal_cursor, receipt.journal_cursor, JOURNAL_PAGE_SIZE)
    .all<{ transaction_id: string; deleted_at: number }>();

  for (const item of items.results) {
    await env.DELETION_JOURNAL.put(
      `deleted-transactions/${userId}/${item.transaction_id}`,
      JSON.stringify({ id: item.transaction_id, userId, deletedAt: item.deleted_at, type: 'transaction' })
    );
  }

  if (items.results.length === JOURNAL_PAGE_SIZE) {
    const cursor = items.results[items.results.length - 1]!.transaction_id;
    await env.DB.prepare(`
      UPDATE account_deletion_receipts SET journal_cursor = ?
      WHERE request_id = ? AND journal_complete = 0 AND journal_cursor IS ?
    `).bind(cursor, requestId, receipt.journal_cursor).run();
    return { completed: false };
  }

  await env.DELETION_JOURNAL.put(
    `deleted-users/${userId}`,
    JSON.stringify({ userId, deletedAt: receipt.completed_at, type: 'user' })
  );
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM account_deletion_items WHERE request_id = ?`).bind(requestId),
    env.DB.prepare(`
      UPDATE account_deletion_receipts
      SET user_id = NULL, journal_cursor = NULL, journal_complete = 1
      WHERE request_id = ? AND journal_complete = 0
    `).bind(requestId)
  ]);
  return { completed: true };
}

async function getReceipt(env: Env, requestId: string): Promise<DeletionReceipt | null> {
  return env.DB.prepare(`
    SELECT request_id, owner_binding, owner_hash, user_id, journal_cursor, journal_complete, completed_at
    FROM account_deletion_receipts WHERE request_id = ?
  `).bind(requestId).first<DeletionReceipt>();
}

async function deletionOwnerBinding(userId: string, requestId: string): Promise<string> {
  return hashValue(`${userId}:${requestId}`);
}

async function hashValue(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
