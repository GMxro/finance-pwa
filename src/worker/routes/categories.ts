// Categories routes
import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId } from '../middleware/session';
import { ValidationError } from '../middleware/error-handler';
import type { Env } from '@env';
import { listCategories, createCategory, updateCategory, archiveCategory, unarchiveCategory } from '../application/categories/categories';

const categoriesRoutes = new Hono<{ Bindings: Env }>();

categoriesRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const includeArchived = c.req.query('includeArchived') === '1';
  const categories = await listCategories(c.env, userId, includeArchived);
  return c.json(categories);
});

const createCatSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['income', 'expense']),
  name: z.string().min(1).max(50),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  iconKey: z.string().min(1).max(30),
  colorToken: z.string().min(1).max(20),
  sortOrder: z.number().int().nonnegative().default(0)
});

categoriesRoutes.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const result = createCatSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  const category = await createCategory(c.env, userId, result.data);
  return c.json(category, 201);
});

const updateCatSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50).optional(),
  iconKey: z.string().min(1).max(30).optional(),
  colorToken: z.string().min(1).max(20).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  archivedAt: z.number().int().nonnegative().nullable().optional()
});

categoriesRoutes.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = updateCatSchema.safeParse({ ...body, id });
  
  if (!result.success) {
    throw new ValidationError('Datos inválidos', result.error.flatten());
  }
  
  if (result.data.archivedAt !== undefined) {
    const category = result.data.archivedAt === null
      ? await unarchiveCategory(c.env, userId, id)
      : await archiveCategory(c.env, userId, id);
    return c.json(category);
  }
  
  const category = await updateCategory(c.env, userId, result.data);
  return c.json(category);
});

export { categoriesRoutes };