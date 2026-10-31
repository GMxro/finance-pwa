// Account routes - profile, export, delete
import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId } from '../middleware/session';
import { NotFoundError, ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import type { UserPublic } from '@contracts/auth';
import { currencyCodeSchema } from '@contracts/transaction';
import { ARGENTINA_TZ } from '@domain/date';
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
  
  const lines = [
    'Movimientos',
    'ID,Tipo,Importe,Moneda,Categoría,Fecha,Nota,Creado'
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
    // Wrap in double quotes if contains comma, double quote, newline, or starts with formula prefix
    if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r') || safe.startsWith("'")) {
      return `"${escaped}"`;
    }
    return escaped;
  }
  
  for (const tx of transactions.results as any[]) {
    const amount = tx.amount_minor / 100;
    lines.push([
      escapeCsvField(tx.id),
      escapeCsvField(tx.kind),
      escapeCsvField(amount.toFixed(2)),
      escapeCsvField(tx.currency_code),
      escapeCsvField(tx.category_id),
      escapeCsvField(tx.occurred_on),
      escapeCsvField(tx.note),
      escapeCsvField(new Date(tx.created_at).toISOString())
    ].join(','));
  }
  
  lines.push('', 'Categorías', 'ID,Tipo,Nombre,Slug,Icono,Color,Orden,Por defecto,Archivada');
  for (const cat of categories.results as any[]) {
    lines.push([
      escapeCsvField(cat.id),
      escapeCsvField(cat.kind),
      escapeCsvField(cat.name),
      escapeCsvField(cat.slug),
      escapeCsvField(cat.icon_key),
      escapeCsvField(cat.color_token),
      escapeCsvField(cat.sort_order),
      escapeCsvField(cat.is_default ? 'Sí' : 'No'),
      escapeCsvField(cat.archived_at ? new Date(cat.archived_at).toISOString() : '')
    ].join(','));
  }
  
  lines.push('', 'Presupuestos', 'ID,Categoría,Período,Moneda,Límite');
  for (const bud of budgets.results as any[]) {
    lines.push([
      escapeCsvField(bud.id),
      escapeCsvField(bud.category_id),
      escapeCsvField(bud.period_month),
      escapeCsvField(bud.currency_code),
      escapeCsvField((bud.limit_minor / 100).toFixed(2))
    ].join(','));
  }
  
  const csv = lines.join('\n');
  // Add UTF-8 BOM for proper encoding detection in spreadsheet applications
  const bom = '\uFEFF';
  
  return new Response(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="finanzas-${new Date().toISOString().split('T')[0]}.csv"`,
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
  return c.json(await getAccountDeletionStatus(c.env, parsed.data), 200, { 'Cache-Control': 'no-store' });
});

export { accountRoutes, deletionStatusRoutes };
