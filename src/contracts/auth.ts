// Contracts: Auth DTOs
import { z } from 'zod';

export const userPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.number(),
  token: z.string(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export type UserPublic = z.infer<typeof userPublicSchema>;
export type Session = z.infer<typeof sessionSchema>;