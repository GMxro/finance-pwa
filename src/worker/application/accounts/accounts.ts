// Application: Accounts (cuentas propias del usuario)
import type { Env } from '@env';
import type {
  AccountCreate,
  AccountResponse,
  AccountUpdate,
  AccountWithBalances
} from '@contracts/account';
import { NotFoundError, ValidationError } from '../../middleware/error-handler';
import { todayLocalISO } from '@domain/date';

function safeBalance(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) {
    throw new ValidationError('El saldo excede el rango exacto admitido.');
  }
  return amount;
}

async function balanceQuery<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (error instanceof Error && /integer overflow/i.test(error.message)) {
      throw new ValidationError('El saldo excede el rango exacto admitido.');
    }
    throw error;
  }
}

function mapAccount(row: any): AccountResponse {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind,
    isDefault: row.is_default === 1,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const ACCOUNT_COLUMNS = `id, user_id, name, kind, is_default, sort_order, archived_at, created_at, updated_at`;

/**
 * Saldos por cuenta y moneda.
 * Un movimiento suma o resta según su tipo; una transferencia resta en la
 * cuenta de origen y suma en la de destino. Nunca toca ingresos ni gastos.
 */
async function balancesByAccount(env: Env, userId: string): Promise<Map<string, Array<{ currency: 'ARS' | 'USD'; amountMinor: number }>>> {
  const today = todayLocalISO();
  const result = await balanceQuery(env.DB.prepare(`
    SELECT account_id, currency_code, SUM(delta_minor) AS net_minor
    FROM (
      SELECT account_id, currency_code,
             CASE WHEN kind = 'income' THEN amount_minor ELSE -amount_minor END AS delta_minor
      FROM transactions
      WHERE user_id = ? AND deleted_at IS NULL AND account_id IS NOT NULL AND occurred_on <= ?
      UNION ALL
      SELECT from_account_id, from_currency_code, -from_amount_minor
      FROM transfers
      WHERE user_id = ? AND deleted_at IS NULL AND occurred_on <= ?
      UNION ALL
      SELECT to_account_id, to_currency_code, to_amount_minor
      FROM transfers
      WHERE user_id = ? AND deleted_at IS NULL AND occurred_on <= ?
    )
    GROUP BY account_id, currency_code
  `).bind(userId, today, userId, today, userId, today).all());

  const map = new Map<string, Array<{ currency: 'ARS' | 'USD'; amountMinor: number }>>();
  for (const row of result.results as any[]) {
    const list = map.get(row.account_id) ?? [];
    list.push({ currency: row.currency_code, amountMinor: safeBalance(row.net_minor) });
    map.set(row.account_id, list);
  }
  return map;
}

export async function listAccounts(
  env: Env,
  userId: string,
  includeArchived = false
): Promise<AccountWithBalances[]> {
  const conditions = ['user_id = ?'];
  if (!includeArchived) conditions.push('archived_at IS NULL');

  const rows = await env.DB.prepare(`
    SELECT ${ACCOUNT_COLUMNS}
    FROM accounts
    WHERE ${conditions.join(' AND ')}
    ORDER BY is_default DESC, sort_order ASC, name ASC
  `).bind(userId).all();

  const balances = await balancesByAccount(env, userId);

  return (rows.results as any[]).map(row => ({
    ...mapAccount(row),
    balances: (balances.get(row.id) ?? []).sort((a, b) => a.currency.localeCompare(b.currency))
  }));
}

export async function getDefaultAccountId(env: Env, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(`
    SELECT id FROM accounts
    WHERE user_id = ? AND archived_at IS NULL
    ORDER BY is_default DESC, sort_order ASC, name ASC
    LIMIT 1
  `).bind(userId).first<{ id: string }>();
  return row?.id ?? null;
}

export async function createAccount(
  env: Env,
  userId: string,
  data: AccountCreate
): Promise<AccountResponse> {
  const now = Date.now();
  const existing = await env.DB.prepare(`
    SELECT COUNT(*) AS total, COALESCE(MAX(sort_order), -1) AS last_sort
    FROM accounts WHERE user_id = ?
  `).bind(userId).first<{ total: number; last_sort: number }>();

  const isFirst = (existing?.total ?? 0) === 0;
  const sortOrder = data.sortOrder || (existing?.last_sort ?? -1) + 1;

  await env.DB.prepare(`
    INSERT INTO accounts (id, user_id, name, kind, is_default, sort_order, archived_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).bind(data.id, userId, data.name.trim(), data.kind, isFirst ? 1 : 0, sortOrder, now, now).run();

  const row = await env.DB.prepare(`
    SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ? AND user_id = ?
  `).bind(data.id, userId).first();

  if (!row) throw new Error('Error al crear la cuenta');
  return mapAccount(row);
}

export async function updateAccount(
  env: Env,
  userId: string,
  data: AccountUpdate & { id: string }
): Promise<AccountResponse> {
  const current = await env.DB.prepare(`
    SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ? AND user_id = ?
  `).bind(data.id, userId).first<any>();

  if (!current) throw new NotFoundError('Cuenta no encontrada');

  const now = Date.now();
  const archiving = data.archivedAt !== undefined && data.archivedAt !== null;

  if (archiving) {
    const active = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM accounts
      WHERE user_id = ? AND archived_at IS NULL AND id <> ?
    `).bind(userId, data.id).first<{ total: number }>();

    if ((active?.total ?? 0) === 0) {
      throw new ValidationError('Necesitás al menos una cuenta activa.');
    }
  }

  const setParts: string[] = ['updated_at = ?'];
  const bindings: any[] = [now];

  if (data.name !== undefined) { setParts.push('name = ?'); bindings.push(data.name.trim()); }
  if (data.kind !== undefined) { setParts.push('kind = ?'); bindings.push(data.kind); }
  if (data.sortOrder !== undefined) { setParts.push('sort_order = ?'); bindings.push(data.sortOrder); }
  if (data.archivedAt !== undefined) { setParts.push('archived_at = ?'); bindings.push(data.archivedAt); }

  await env.DB.prepare(`
    UPDATE accounts SET ${setParts.join(', ')} WHERE id = ? AND user_id = ?
  `).bind(...bindings, data.id, userId).run();

  if (data.isDefault === true) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE accounts SET is_default = 0 WHERE user_id = ?`).bind(userId),
      env.DB.prepare(`UPDATE accounts SET is_default = 1 WHERE id = ? AND user_id = ? AND archived_at IS NULL`).bind(data.id, userId)
    ]);
  }

  if (archiving && current.is_default === 1) {
    const next = await env.DB.prepare(`
      SELECT id FROM accounts
      WHERE user_id = ? AND archived_at IS NULL
      ORDER BY sort_order ASC, name ASC
      LIMIT 1
    `).bind(userId).first<{ id: string }>();

    if (next) {
      await env.DB.batch([
        env.DB.prepare(`UPDATE accounts SET is_default = 0 WHERE user_id = ?`).bind(userId),
        env.DB.prepare(`UPDATE accounts SET is_default = 1 WHERE id = ? AND user_id = ?`).bind(next.id, userId)
      ]);
    }
  }

  const row = await env.DB.prepare(`
    SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ? AND user_id = ?
  `).bind(data.id, userId).first<any>();

  if (!row) throw new NotFoundError('Cuenta no encontrada');
  return mapAccount(row);
}
