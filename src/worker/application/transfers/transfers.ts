// Application: Transfers (movimientos entre cuentas propias)
import type { Env } from '@env';
import type { TransferCreate, TransferResponse } from '@contracts/transfer';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/error-handler';
import { currencyFlowBindings, currencyFlowTotalSql } from '../financial-limit';
import { MAX_MINOR_UNITS } from '@domain/money';

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
  const fromAmountMinor = Number(row.from_amount_minor);
  const toAmountMinor = Number(row.to_amount_minor);
  if (!Number.isSafeInteger(fromAmountMinor) || fromAmountMinor <= 0 ||
      !Number.isSafeInteger(toAmountMinor) || toAmountMinor <= 0) {
    throw new ValidationError('El importe excede el rango exacto admitido.');
  }
  return {
    id: row.id,
    userId: row.user_id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    fromAmountMinor,
    fromCurrency: row.from_currency_code,
    toAmountMinor,
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
  params: { period?: string; accountId?: string; page?: number; limit?: number }
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
    LIMIT ? OFFSET ?
  `).bind(...bindings, params.limit ?? 100, ((params.page ?? 1) - 1) * (params.limit ?? 100)).all();

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

  const toCurrency = data.toCurrency ?? data.fromCurrency;
  const sameCurrency = toCurrency === data.fromCurrency;
  const toAmount = data.toAmountMinor ?? (sameCurrency ? data.fromAmountMinor : undefined);

  if (!toAmount) {
    throw new ValidationError('Indicá cuánto entra en la cuenta de destino.');
  }

  const existing = await env.DB.prepare(`
    ${TRANSFER_SELECT} WHERE t.id = ? AND t.user_id = ?
  `).bind(data.id, userId).first<any>();
  if (existing) {
    const sameRequest = existing.deleted_at == null &&
      existing.from_account_id === data.fromAccountId &&
      existing.to_account_id === data.toAccountId &&
      existing.from_amount_minor === data.fromAmountMinor &&
      existing.from_currency_code === data.fromCurrency &&
      existing.to_amount_minor === toAmount &&
      existing.to_currency_code === toCurrency &&
      existing.occurred_on === data.occurredOn &&
      existing.note === (data.note || null);
    if (!sameRequest) throw new ConflictError('El identificador de transferencia ya se usó con otros datos.');
    return mapTransfer(existing);
  }

  const accounts = await env.DB.prepare(`
    SELECT id, name, archived_at FROM accounts
    WHERE user_id = ? AND id IN (?, ?)
  `).bind(userId, data.fromAccountId, data.toAccountId).all<{ id: string; name: string; archived_at: number | null }>();

  const rows = accounts.results as any[];
  const from = rows.find(row => row.id === data.fromAccountId);
  const to = rows.find(row => row.id === data.toAccountId);

  if (!from || !to) throw new ValidationError('Alguna de las cuentas no existe.');
  if (from.archived_at || to.archived_at) throw new ValidationError('Elegí cuentas activas.');

  const now = Date.now();

  let result: D1Result;
  try {
    result = await env.DB.prepare(`
    INSERT INTO transfers (
      id, user_id, from_account_id, to_account_id,
      from_amount_minor, from_currency_code, to_amount_minor, to_currency_code,
      occurred_on, note, created_at, updated_at, deleted_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
    WHERE ${currencyFlowTotalSql()} + ?${sameCurrency ? ' + ?' : ''} <= ?
      AND ${currencyFlowTotalSql()} + ? <= ?
  `).bind(
    data.id, userId, data.fromAccountId, data.toAccountId,
    data.fromAmountMinor, data.fromCurrency, toAmount, toCurrency,
    data.occurredOn, data.note || null, now, now,
    ...currencyFlowBindings(userId, data.fromCurrency), data.fromAmountMinor,
    ...(sameCurrency ? [toAmount] : []), MAX_MINOR_UNITS,
    ...currencyFlowBindings(userId, toCurrency), toAmount, MAX_MINOR_UNITS
    ).run();
  } catch (error) {
    if (error instanceof Error && /integer overflow/i.test(error.message)) {
      throw new ValidationError('El total financiero excede el rango exacto admitido.');
    }
    throw error;
  }
  if (result.meta.changes === 0) {
    throw new ValidationError('El total financiero excede el rango exacto admitido.');
  }

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
