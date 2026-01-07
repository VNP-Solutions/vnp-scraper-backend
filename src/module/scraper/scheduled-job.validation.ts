import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Date must be in YYYY-MM-DD format',
});

export const createScheduledJobSchema = z
  .object({
    date: dateStringSchema,
    job_ids: z.array(objectIdSchema).optional().default([]),
    retrieval_ids: z.array(objectIdSchema).optional().default([]),
  })
  .refine(
    (data) =>
      (data.job_ids && data.job_ids.length > 0) ||
      (data.retrieval_ids && data.retrieval_ids.length > 0),
    {
      message: 'At least one job ID or retrieval ID is required',
    },
  );

export type CreateScheduledJobType = z.infer<typeof createScheduledJobSchema>;
