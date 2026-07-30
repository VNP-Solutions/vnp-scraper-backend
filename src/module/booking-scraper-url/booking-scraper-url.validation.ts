import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

const urlSchema = z.string().url('Invalid URL format');

export const createBookingScraperUrlSchema = z.object({
  url: urlSchema,
});

export const updateBookingScraperUrlSchema = z.object({
  url: urlSchema,
});

export const bulkDeleteBookingScraperUrlSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'At least one ID is required'),
});

export type CreateBookingScraperUrlType = z.infer<
  typeof createBookingScraperUrlSchema
>;
export type UpdateBookingScraperUrlType = z.infer<
  typeof updateBookingScraperUrlSchema
>;
export type BulkDeleteBookingScraperUrlType = z.infer<
  typeof bulkDeleteBookingScraperUrlSchema
>;
