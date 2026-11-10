// Account routes - profile, export, delete
import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId, sessionMiddleware } from '../middleware/session';
import { NotFoundError, ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import type { UserPublic } from '@contracts/auth';
import { currencyCodeSchema } from '@contracts/transaction';
import { ARGENTINA_TZ, todayLocalISO } from '@domain/date';
import { deleteAccount, getAccountDeletionStatus } from '../application/account/delete-account';
import { deletionStatusRateLimit } from '../middleware/rate-limit';

const accountRoutes = new Hono<{ Bindings: Env }>();
const deletionStatusRoutes = new Hono<{ Bindings: Env }>();
deletionStatusRoutes.use('*', deletionStatusRateLimit);

const preferencesSchema = z.object({ default_currency: currencyCodeSchema }).strict();

// Get current user profile
accountRoutes.get('/profile', async (c) => {
  const userId = getUserId(c);
  
  const user = await c.env.DB.prepare(`
    SELECT id, name, email, emailVerified AS email_verified, image, createdAt AS created_at, updatedAt AS updated_at
    FROM "user" WHERE id = ?
  `).bind(userId).first<UserPublic>();
  
  if (!user) {
    throw new NotFoundError('Usuario no encontrado');
  }
  
  return c.json(user);
});

accountRoutes.patch('/preferences', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Preferencias inválidas.', parsed.error.flatten());

  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO user_preferences (user_id, locale, time_zone, default_currency, created_at, updated_at)
      VALUES (?, 'es-AR', ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        default_currency = excluded.default_currency,
        updated_at = excluded.updated_at
    `).bind(userId, ARGENTINA_TZ, parsed.data.default_currency, now, now),
    c.env.DB.prepare(`
      INSERT INTO user_onboarding (user_id, completed_at) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET completed_at = COALESCE(user_onboarding.completed_at, excluded.completed_at)
    `).bind(userId, now)
  ]);

  return c.json({ defaultCurrency: parsed.data.default_currency });
});

// Export user data as CSV

// Importes sin símbolo ni separador de miles (Excel es-AR usa coma decimal).
const exportAmountFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false
});

const exportDateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: ARGENTINA_TZ
});

const EXPORT_KIND_LABELS: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto'
};

function formatExportKind(kind: string): string {
  return EXPORT_KIND_LABELS[kind] ?? kind;
}

function formatExportAmount(amountMinor: number): string {
  return exportAmountFormatter.format(amountMinor / 100);
}

function formatExportDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

function formatExportDateTime(timestamp: number | string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const parts = exportDateTimeFormatter.formatToParts(date);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

function formatExportPeriod(periodMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodMonth);
  if (!match) return periodMonth;
  const [, year, month] = match;
  if (!year || !month) return periodMonth;
  return `${month}/${year}`;
}

type TransactionExportRow = {
  id: string;
  kind: string;
  amount_minor: number;
  currency_code: string;
  category_id: string;
  occurred_on: string;
  note: string | null;
  created_at: number;
};

type CategoryExportRow = {
  id: string;
  kind: string;
  name: string;
  slug: string;
  icon_key: string;
  color_token: string;
  sort_order: number;
  is_default: number;
  archived_at: number | null;
};

type BudgetExportRow = {
  id: string;
  category_id: string;
  period_month: string;
  currency_code: string;
  limit_minor: number;
};

accountRoutes.get('/export', async (c) => {
  const userId = getUserId(c);
  
  const [transactions, categories, budgets] = await Promise.all([
    c.env.DB.prepare(`
      SELECT id, kind, amount_minor, currency_code, category_id, occurred_on, note, created_at
      FROM transactions WHERE user_id = ? AND deleted_at IS NULL ORDER BY occurred_on DESC
    `).bind(userId).all(),
    c.env.DB.prepare(`
      SELECT id, kind, name, slug, icon_key, color_token, sort_order, is_default, archived_at
      FROM categories WHERE user_id = ? ORDER BY kind, sort_order
    `).bind(userId).all(),
    c.env.DB.prepare(`
      SELECT id, category_id, period_month, currency_code, limit_minor
      FROM budgets WHERE user_id = ? ORDER BY period_month DESC
    `).bind(userId).all()
  ]);

  const transactionRows = transactions.results as unknown as TransactionExportRow[];
  const categoryRows = categories.results as unknown as CategoryExportRow[];
  const budgetRows = budgets.results as unknown as BudgetExportRow[];

  const categoryNames = new Map<string, string>(categoryRows.map((cat) => [cat.id, cat.name]));
  const categoryName = (categoryId: string): string => categoryNames.get(categoryId) ?? categoryId;

  const lines = [
    'Movimientos',
    'ID;Tipo;Importe;Moneda;Categoría;Fecha;Nota;Creado'
  ];

  function escapeCsvField(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Prevent formula injection: prefix with single quote if starts with =, +, -, @
    const safe = str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')
      ? "'" + str
      : str;
    // Escape double quotes by doubling them
    const escaped = safe.replace(/"/g, '""');
    // Wrap in double quotes if it contains the delimiter, quotes, newlines, or the formula prefix
    if (escaped.includes(';') || escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r') || safe.startsWith("'")) {
      return `"${escaped}"`;
    }
    return escaped;
  }

  for (const tx of transactionRows) {
    lines.push([
      escapeCsvField(tx.id),
      escapeCsvField(formatExportKind(tx.kind)),
      escapeCsvField(formatExportAmount(tx.amount_minor)),
      escapeCsvField(tx.currency_code),
      escapeCsvField(categoryName(tx.category_id)),
      escapeCsvField(formatExportDate(tx.occurred_on)),
      escapeCsvField(tx.note),
      escapeCsvField(formatExportDateTime(tx.created_at))
    ].join(';'));
  }

  lines.push('', 'Categorías', 'ID;Tipo;Nombre;Slug;Icono;Color;Orden;Por defecto;Archivada');
  for (const cat of categoryRows) {
    lines.push([
      escapeCsvField(cat.id),
      escapeCsvField(formatExportKind(cat.kind)),
      escapeCsvField(cat.name),
      escapeCsvField(cat.slug),
      escapeCsvField(cat.icon_key),
      escapeCsvField(cat.color_token),
      escapeCsvField(cat.sort_order),
      escapeCsvField(cat.is_default ? 'Sí' : 'No'),
      escapeCsvField(cat.archived_at ? formatExportDateTime(cat.archived_at) : '')
    ].join(';'));
  }

  lines.push('', 'Presupuestos', 'ID;Categoría;Período;Moneda;Límite');
  for (const bud of budgetRows) {
    lines.push([
      escapeCsvField(bud.id),
      escapeCsvField(categoryName(bud.category_id)),
      escapeCsvField(formatExportPeriod(bud.period_month)),
      escapeCsvField(bud.currency_code),
      escapeCsvField(formatExportAmount(bud.limit_minor))
    ].join(';'));
  }
  
  const csv = lines.join('\n');
  // Add UTF-8 BOM for proper encoding detection in spreadsheet applications
  const bom = '\uFEFF';
  
  return new Response(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="finanzas-${todayLocalISO()}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
});

// Delete account
const deleteAccountSchema = z.object({
  confirmation: z.string().min(1, 'Confirmación requerida'),
  requestId: z.string().uuid()
}).strict();

accountRoutes.post('/delete', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const result = deleteAccountSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  if (result.data.confirmation !== 'ELIMINAR MI CUENTA') {
    throw new ValidationError('Confirmación incorrecta. Escriba exactamente: ELIMINAR MI CUENTA');
  }
  
  const deletion = await deleteAccount(c.env, userId, result.data.requestId);
  
  return c.json(deletion);
});

deletionStatusRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.union([
    z.object({ requestId: z.string().uuid() }).strict(),
    z.object({ userId: z.string().min(1).max(128) }).strict()
  ]).safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Identificador de borrado inválido.');
  }
  // Toda consulta de estado de borrado requiere sesión autenticada.
  const authResponse = await sessionMiddleware(c, async () => {});
  if (authResponse) return authResponse;
  const sessionUser = c.get('user' as any) as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Se requiere sesión.' }, 401);
  }
  if ('userId' in parsed.data && sessionUser.id !== parsed.data.userId) {
    return c.json({ code: 'FORBIDDEN', message: 'No podés consultar el estado de otra cuenta.' }, 403);
  }
  return c.json(await getAccountDeletionStatus(c.env, parsed.data), 200, { 'Cache-Control': 'no-store' });
});

export { accountRoutes, deletionStatusRoutes };
