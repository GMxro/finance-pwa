import type { Env } from '@env';

const DEFAULT_CATEGORIES = [
  { kind: 'income', name: 'Salario', slug: 'salario', icon_key: 'briefcase', color_token: 'income-primary', sort_order: 1 },
  { kind: 'income', name: 'Freelance', slug: 'freelance', icon_key: 'laptop', color_token: 'income-secondary', sort_order: 2 },
  { kind: 'income', name: 'Inversiones', slug: 'inversiones', icon_key: 'trending-up', color_token: 'income-tertiary', sort_order: 3 },
  { kind: 'income', name: 'Otros ingresos', slug: 'otros-ingresos', icon_key: 'plus-circle', color_token: 'income-muted', sort_order: 4 },
  { kind: 'expense', name: 'Alimentación', slug: 'alimentacion', icon_key: 'utensils', color_token: 'expense-food', sort_order: 1 },
  { kind: 'expense', name: 'Transporte', slug: 'transporte', icon_key: 'bus', color_token: 'expense-transport', sort_order: 2 },
  { kind: 'expense', name: 'Vivienda', slug: 'vivienda', icon_key: 'home', color_token: 'expense-housing', sort_order: 3 },
  { kind: 'expense', name: 'Servicios', slug: 'servicios', icon_key: 'zap', color_token: 'expense-services', sort_order: 4 },
  { kind: 'expense', name: 'Salud', slug: 'salud', icon_key: 'heart-pulse', color_token: 'expense-health', sort_order: 5 },
  { kind: 'expense', name: 'Entretenimiento', slug: 'entretenimiento', icon_key: 'gamepad-2', color_token: 'expense-fun', sort_order: 6 },
  { kind: 'expense', name: 'Compras', slug: 'compras', icon_key: 'shopping-bag', color_token: 'expense-shopping', sort_order: 7 },
  { kind: 'expense', name: 'Educación', slug: 'educacion', icon_key: 'graduation-cap', color_token: 'expense-education', sort_order: 8 },
  { kind: 'expense', name: 'Otros gastos', slug: 'otros-gastos', icon_key: 'more-horizontal', color_token: 'expense-other', sort_order: 9 }
];

export async function initializeUserData(env: Env, userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    // Cuenta por defecto: todo movimiento necesita una cuenta y los datos
    // anteriores a las cuentas se asignan acá.
    env.DB.prepare(`
      INSERT INTO accounts (id, user_id, name, kind, is_default, sort_order, archived_at, created_at, updated_at)
      SELECT ?, ?, 'Efectivo', 'cash', 1, 0, NULL, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = ?)
    `).bind(crypto.randomUUID(), userId, now, now, userId),
    env.DB.prepare(`
      UPDATE transactions
      SET account_id = (
        SELECT id FROM accounts
        WHERE user_id = ?
        ORDER BY is_default DESC, sort_order ASC, name ASC
        LIMIT 1
      )
      WHERE user_id = ? AND account_id IS NULL
    `).bind(userId, userId),
    env.DB.prepare(`
      INSERT INTO user_preferences (user_id, locale, time_zone, default_currency, created_at, updated_at)
      VALUES (?, 'es-AR', 'America/Argentina/Buenos_Aires', 'ARS', ?, ?)
      ON CONFLICT(user_id) DO NOTHING
    `).bind(userId, now, now),
    ...DEFAULT_CATEGORIES.map((category) => env.DB.prepare(`
      INSERT INTO categories (id, user_id, kind, name, slug, icon_key, color_token, sort_order, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(user_id, slug) DO NOTHING
    `).bind(
      crypto.randomUUID(), userId, category.kind, category.name, category.slug,
      category.icon_key, category.color_token, category.sort_order, now, now
    )),
    env.DB.prepare(`
      INSERT INTO user_sync_state (user_id, sequence) VALUES (?, 0)
      ON CONFLICT(user_id) DO NOTHING
    `).bind(userId)
  ]);
}
