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

const DEFAULT_ACCOUNTS = [
  { name: 'Efectivo', kind: 'cash', is_default: 1, sort_order: 1 },
  { name: 'Banco', kind: 'bank', is_default: 0, sort_order: 2 },
  { name: 'Otra cuenta', kind: 'bank', is_default: 0, sort_order: 3 },
];

export async function initializeUserData(env: Env, userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    // Cuentas por defecto
    ...DEFAULT_ACCOUNTS.map((account, _index) => env.DB.prepare(`
      INSERT INTO accounts (id, user_id, name, description, kind, is_default, sort_order, archived_at, created_at, updated_at)
      SELECT ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = ? AND name = ?)
    `).bind(crypto.randomUUID(), userId, account.name, account.kind, account.is_default, account.sort_order, now, now, userId, account.name)),
    // Preferencias de usuario
    env.DB.prepare(`
      INSERT INTO user_preferences (user_id, locale, time_zone, default_currency, created_at, updated_at)
      VALUES (?, 'es-AR', 'America/Argentina/Buenos_Aires', 'ARS', ?, ?)
      ON CONFLICT(user_id) DO NOTHING
    `).bind(userId, now, now),
    env.DB.prepare(`
      INSERT INTO user_onboarding (user_id, completed_at) VALUES (?, NULL)
      ON CONFLICT(user_id) DO NOTHING
    `).bind(userId),
    // Categorías por defecto
    ...DEFAULT_CATEGORIES.map((category) => env.DB.prepare(`
      INSERT INTO categories (id, user_id, kind, name, slug, icon_key, color_token, sort_order, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(user_id, slug) DO NOTHING
    `).bind(
      crypto.randomUUID(), userId, category.kind, category.name, category.slug,
      category.icon_key, category.color_token, category.sort_order, now, now
    )),
    // Estado de sincronización
    env.DB.prepare(`
      INSERT INTO user_sync_state (user_id, sequence) VALUES (?, 0)
      ON CONFLICT(user_id) DO NOTHING
    `).bind(userId)
  ]);
}
