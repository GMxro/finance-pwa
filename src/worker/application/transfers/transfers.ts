// Application: Transfers (movimientos entre cuentas propias)
import type { Env } from '@env';
import type { TransferCreate, TransferResponse } from '@contracts/transfer';
import { NotFoundError, ValidationError } from '../../middleware/error-handler';

const TRANSFER_SELECT = `
  SELECT t.id, t.user_id, t.from_account_id, t.to_account_id,
         t.from_amount_minor, t.from_currency_code,
         t.to_amount_minor, t.to_currency_code,
         t.occurred_on, t.note, t.created_at, t.updated_at, t.deleted_at,
         fa.name AS from_account_name, ta.name AS to_account_name
  FROM transfers t
  JOIN accounts fa ON fa.id = t.from_account_id AND fa.user_id = t.user_id
  JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id
`;

function mapTransfer(row: any): TransferResponse {
  return {
    id: row.id,
    userId: row.user_id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    fromAmountMinor: row.from_amount_minor,
    fromCurrency: row.from_currency_code,
    toAmountMinor: row.to_amount_minor,
    toCurrency: row.to_currency_code,
    fromAccountName: row.from_account_name,
    toAccountName: row.to_account_name,
    occurredOn: row.occurred_on,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null
  };
}

export async function listTransfers(
  env: Env,
  userId: string,
  params: { period?: string; accountId?: string; limit?: number }
): Promise<TransferResponse[]> {
  const conditions = ['t.user_id = ?', 't.deleted_at IS NULL'];
  const bindings: any[] = [userId];

  if (params.period) {
    conditions.push('t.occurred_on LIKE ?');
    bindings.push(`${params.period}%`);
  }
  if (params.accountId) {
    conditions.push('(t.from_account_id = ? OR t.to_account_id = ?)');
    bindings.push(params.accountId, params.accountId);
  }

  const result = await env.DB.prepare(`
    ${TRANSFER_SELECT}
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.occurred_on DESC, t.created_at DESC
    LIMIT ?
  `).bind(...bindings, params.limit ?? 100).all();

  return (result.results as any[]).map(mapTransfer);
}

export async function createTransfer(
  env: Env,
  userId: string,
  data: TransferCreate
): Promise<TransferResponse> {
  if (data.fromAccountId === data.toAccountId) {
    throw new ValidationError('Elegí dos cuentas distintas.');
  }

  const existing = await env.DB.prepare(`
    ${TRANSFER_SELECT} WHERE t.id = ? AND t.user_id = ?
  `).bind(data.id, userId).first();

  if (existing) return mapTransfer(existing);

  const accounts = await env.DB.prepare(`
    SELECT id, name, archived_at FROM accounts
    WHERE user_id = ? AND id IN (?, ?)
  `).bind(userId, data.fromAccountId, data.toAccountId).all<{ id: string; name: string; archived_at: number | null }>();

  const rows = accounts.results as any[];
  const from = rows.find(row => row.id === data.fromAccountId);
  const to = rows.find(row => row.id === data.toAccountId);

  if (!from || !to) throw new ValidationError('Alguna de las cuentas no existe.');
  if (from.archived_at || to.archived_at) throw new ValidationError('Elegí cuentas activas.');

  const toCurrency = data.toCurrency ?? data.fromCurrency;
  const sameCurrency = toCurrency === data.fromCurrency;
  const toAmount = sameCurrency ? data.fromAmountMinor : data.toAmountMinor;

  if (!toAmount) {
    throw new ValidationError('Indicá cuánto entra en la cuenta de destino.');
  }

  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO transfers (
      id, user_id, from_account_id, to_account_id,
      from_amount_minor, from_currency_code, to_amount_minor, to_currency_code,
      occurred_on, note, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    data.id, userId, data.fromAccountId, data.toAccountId,
    data.fromAmountMinor, data.fromCurrency, toAmount, toCurrency,
    data.occurredOn, data.note || null, now, now
  ).run();

  const created = await env.DB.prepare(`
    ${TRANSFER_SELECT} WHERE t.id = ? AND t.user_id = ?
  `).bind(data.id, userId).first();

  if (!created) throw new Error('Error al crear la transferencia');
  return mapTransfer(created);
}

export async function deleteTransfer(env: Env, userId: string, id: string): Promise<void> {
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE transfers SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(now, now, id, userId).run();

  if (result.meta.changes === 0) {
    throw new NotFoundError('Transferencia no encontrada');
  }
}
