// Application: Categories business logic
import type { Env } from '@env';
import type { CategoryCreate, CategoryResponse, CategoryUpdate } from '@contracts/category';

function mapCategory(category: any): CategoryResponse {
  return {
    id: category.id,
    userId: category.user_id,
    kind: category.kind,
    name: category.name,
    slug: category.slug,
    iconKey: category.icon_key,
    colorToken: category.color_token,
    sortOrder: category.sort_order,
    isDefault: Boolean(category.is_default),
    archivedAt: category.archived_at,
    createdAt: category.created_at,
    updatedAt: category.updated_at
  };
}

export async function listCategories(env: Env, userId: string, includeArchived = false) {
  const result = await env.DB.prepare(`
    SELECT id, user_id, kind, name, slug, icon_key, color_token, sort_order, is_default, archived_at, created_at, updated_at
    FROM categories WHERE user_id = ? ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY kind, sort_order
  `).bind(userId).all();
  
  return (result.results as any[]).map(mapCategory);
}

export async function createCategory(env: Env, userId: string, data: CategoryCreate) {
  const now = Date.now();
  
  const existing = await env.DB.prepare(`
    SELECT id FROM categories WHERE user_id = ? AND slug = ?
  `).bind(userId, data.slug).first();
  
  if (existing) {
    throw new Error('Slug ya existe');
  }
  
  await env.DB.prepare(`
    INSERT INTO categories (id, user_id, kind, name, slug, icon_key, color_token, sort_order, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(data.id, userId, data.kind, data.name, data.slug, data.iconKey, data.colorToken, data.sortOrder, now, now).run();
  
  const category = await env.DB.prepare(`
    SELECT * FROM categories WHERE id = ?
  `).bind(data.id).first();
  return mapCategory(category);
}

export async function updateCategory(env: Env, userId: string, data: CategoryUpdate) {
  const { id, ...updates } = data;
  const now = Date.now();
  
  const setParts: string[] = ['updated_at = ?'];
  const bindings: any[] = [now];
  
  if (updates.name) { setParts.push('name = ?'); bindings.push(updates.name); }
  if (updates.iconKey) { setParts.push('icon_key = ?'); bindings.push(updates.iconKey); }
  if (updates.colorToken) { setParts.push('color_token = ?'); bindings.push(updates.colorToken); }
  if (updates.sortOrder !== undefined) { setParts.push('sort_order = ?'); bindings.push(updates.sortOrder); }
  
  bindings.push(id, userId);
  
  const result = await env.DB.prepare(`
    UPDATE categories SET ${setParts.join(', ')} WHERE id = ? AND user_id = ?
  `).bind(...bindings).run();
  
  if (result.meta.changes === 0) {
    throw new Error('NOT_FOUND');
  }
  
  return mapCategory(await env.DB.prepare(`SELECT * FROM categories WHERE id = ?`).bind(id).first());
}

export async function archiveCategory(env: Env, userId: string, id: string) {
  const now = Date.now();
  
  const hasTransactions = await env.DB.prepare(`
    SELECT 1 FROM transactions WHERE category_id = ? AND user_id = ? LIMIT 1
  `).bind(id, userId).first();
  
  if (hasTransactions) {
    await env.DB.prepare(`
      UPDATE categories SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `).bind(now, now, id, userId).run();
  } else {
    await env.DB.prepare(`
      DELETE FROM categories WHERE id = ? AND user_id = ?
    `).bind(id, userId).run();
  }
  
  return { success: true };
}
export async function unarchiveCategory(env: Env, userId: string, id: string) {
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE categories SET archived_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?
  `).bind(now, id, userId).run();

  if (result.meta.changes === 0) {
    throw new Error('NOT_FOUND');
  }

  return mapCategory(await env.DB.prepare(`SELECT * FROM categories WHERE id = ?`).bind(id).first());
}
