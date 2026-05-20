import { JobStatus } from '@prisma/client';
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

export const removeJobsFromScheduledJobSchema = z
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

export const removeJobIdsFromAllScheduledJobsSchema = z.object({
  job_ids: z.array(objectIdSchema).min(1, {
    message: 'At least one job ID is required',
  }),
});

export type CreateScheduledJobType = z.infer<typeof createScheduledJobSchema>;
export type RemoveJobsFromScheduledJobType = z.infer<
  typeof removeJobsFromScheduledJobSchema
>;
export type RemoveJobIdsFromAllScheduledJobsType = z.infer<
  typeof removeJobIdsFromAllScheduledJobsSchema
>;

export const getJobsByScheduleDateAndStatusSchema = z.object({
  creating_date: dateStringSchema,
  schedule_date: dateStringSchema,
  status: z.nativeEnum(JobStatus, {
    errorMap: () => ({
      message: `Status must be one of: ${Object.values(JobStatus).join(', ')}`,
    }),
  }),
});

export const createScheduledJobByDateSchema = z.object({
  date: dateStringSchema,
});

export type GetJobsByScheduleDateAndStatusType = z.infer<
  typeof getJobsByScheduleDateAndStatusSchema
>;
export type CreateScheduledJobByDateType = z.infer<
  typeof createScheduledJobByDateSchema
>;