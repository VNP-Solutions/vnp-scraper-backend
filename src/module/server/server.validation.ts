import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

// URL validation
const urlSchema = z.string().url('Invalid URL format');

export const createServerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  url: urlSchema,
  is_active: z.boolean().optional().default(true),
});

export const updateServerSchema = z.object({
  name: z.string().min(1, 'Name must not be empty').max(100, 'Name must be at most 100 characters').optional(),
  url: urlSchema.optional(),
  is_active: z.boolean().optional(),
});

export const bulkDeleteServerSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'At least one ID is required'),
});

export type CreateServerType = z.infer<typeof createServerSchema>;
export type UpdateServerType = z.infer<typeof updateServerSchema>;
export type BulkDeleteServerType = z.infer<typeof bulkDeleteServerSchema>;
