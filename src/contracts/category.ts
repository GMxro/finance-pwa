// Contracts: Category DTOs
import { z } from 'zod';

export const categoryKindSchema = z.enum(['income', 'expense']);

export const categoryCreateSchema = z.object({
  id: z.string().uuid(),
  kind: categoryKindSchema,
  name: z.string().min(1).max(50),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  iconKey: z.string().min(1).max(30),
  colorToken: z.string().min(1).max(20),
  sortOrder: z.number().int().nonnegative().default(0)
});

export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  archivedAt: z.number().int().nonnegative().nullable().optional()
});

export const categoryResponseSchema = categoryCreateSchema.extend({
  userId: z.string(),
  isDefault: z.boolean(),
  archivedAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;