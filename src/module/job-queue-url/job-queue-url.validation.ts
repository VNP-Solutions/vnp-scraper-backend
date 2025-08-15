import { JobQueueUrlStatus } from '@prisma/client';
import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createJobQueueUrlSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name cannot exceed 255 characters'),
  url: z.string().url('URL must be a valid URL'),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
  priority: z.number().int().min(1).max(10).optional().default(1),
  max_concurrent_jobs: z.number().int().min(1).optional().default(1),
  is_active: z.boolean().optional().default(true),
});

export const updateJobQueueUrlSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name cannot exceed 255 characters')
    .optional(),
  url: z.string().url('URL must be a valid URL').optional(),
  status: z.nativeEnum(JobQueueUrlStatus).optional(),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
  priority: z.number().int().min(1).max(10).optional(),
  max_concurrent_jobs: z.number().int().min(1).optional(),
  is_active: z.boolean().optional(),
});

export const bookUrlSchema = z.object({
  jobId: objectIdSchema,
});

export const jobQueueUrlIdSchema = z.object({
  id: objectIdSchema,
});

export const statusFilterSchema = z.object({
  status: z.nativeEnum(JobQueueUrlStatus),
});
