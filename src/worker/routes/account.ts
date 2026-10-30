// Account routes - profile, export, delete
import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId } from '../middleware/session';
import { NotFoundError, ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import type { UserPublic } from '@contracts/auth';
import { deleteAccount } from '../application/account/delete-account';

const accountRoutes = new Hono<{ Bindings: Env }>();

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
  
  for (const tx of transactions.results as any[]) {
    const amount = tx.amount_minor / 100;
    lines.push([
      tx.id,
      tx.kind,
      amount.toFixed(2),
      tx.currency_code,
      tx.category_id,
      tx.occurred_on,
      `"${(tx.note || '').replace(/"/g, '""')}"`,
      new Date(tx.created_at).toISOString()
    ].join(','));
  }
  
  lines.push('', 'Categorías', 'ID,Tipo,Nombre,Slug,Icono,Color,Orden,Por defecto,Archivada');
  for (const cat of categories.results as any[]) {
    lines.push([
      cat.id, cat.kind, cat.name, cat.slug, cat.icon_key,
      cat.color_token, cat.sort_order, cat.is_default,
      cat.archived_at ? new Date(cat.archived_at).toISOString() : ''
    ].join(','));
  }
  
  lines.push('', 'Presupuestos', 'ID,Categoría,Período,Moneda,Límite');
  for (const bud of budgets.results as any[]) {
    lines.push([bud.id, bud.category_id, bud.period_month, bud.currency_code, (bud.limit_minor / 100).toFixed(2)].join(','));
  }
  
  const csv = lines.join('\n');
  
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="finanzas-${new Date().toISOString().split('T')[0]}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
});

// Delete account
const deleteAccountSchema = z.object({
  confirmation: z.string().min(1, 'Confirmación requerida')
});

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
  
  await deleteAccount(c.env, userId);
  
  return c.json({ success: true, message: 'Cuenta eliminada correctamente' });
});

export { accountRoutes };