import { JobStatus, OTAProvider, PostingType } from '@prisma/client';
import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

// Date validation (YYYY-MM-DD format)
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Date must be in YYYY-MM-DD format',
});

export const createRecurringJobSchema = z.object({
  job_status: z.nativeEnum(JobStatus).default(JobStatus.Pending),
  portfolio_id: objectIdSchema.optional(),
  sub_portfolio_id: objectIdSchema.optional().nullable(),
  property_id: objectIdSchema.optional(),
  posting_type: z.nativeEnum(PostingType),
  portfolio_name: z.string().optional().nullable(),
  sub_portfolio_name: z.string().optional().nullable(),
  property_name: z.string().min(1, 'Property name is required'),
  billing_type: z.string().optional().nullable(),
  next_due_date: z.string(),
  schedule_date: dateStringSchema,
  ota_provider: z.nativeEnum(OTAProvider),
  remaining_direct_billed: z.number().min(0),
  total_collectable: z.number().min(0),
  total_amount_confirmed: z.number().min(0),
  execution_type: z.string().min(1, 'Execution type is required'),
  retries_attempted: z.number().int().min(0).default(0),
  max_retries: z.number().int().min(1).default(3),
  retry_delay_ms: z.number().int().optional(),
  priority: z.number().int().min(0).default(0),
  job_backoff_length_loading: z.number().int().min(0),
  job_backoff_length_selector: z.number().int().min(0),
  queue_name: z.string().optional(),
  worker_assigned: z.string().optional(),
  batch_execution_id: z.string().optional(),
  log_link: z.string().optional().nullable(),
  live_url: z.string().optional().nullable(),
  db_billing_duration: z.number().int().optional().nullable(),
  duration: z.number().int().min(1).max(12).default(1),
  watcher_emails: z.array(z.string()).optional(),
});

export const createRecurringJobFromJobSchema = z.object({
  job_id: objectIdSchema,
  schedule_date: dateStringSchema,
  duration: z.number().int().min(1).max(12).default(1),
});

export const updateRecurringJobSchema = z.object({
  schedule_date: dateStringSchema.optional(),
  name: z.string().optional(),
  duration: z.number().int().min(1).max(12).optional(),
});

export const updateRecurringJobStatusSchema = z.object({
  is_active: z.boolean({
    required_error: 'is_active is required',
    invalid_type_error: 'is_active must be a boolean',
  }),
});

export const bulkDeleteRecurringJobSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'At least one ID is required'),
});

export type CreateRecurringJobType = z.infer<typeof createRecurringJobSchema>;
export type CreateRecurringJobFromJobType = z.infer<
  typeof createRecurringJobFromJobSchema
>;
export type UpdateRecurringJobType = z.infer<typeof updateRecurringJobSchema>;
export type UpdateRecurringJobStatusType = z.infer<
  typeof updateRecurringJobStatusSchema
>;
export type BulkDeleteRecurringJobType = z.infer<
  typeof bulkDeleteRecurringJobSchema
>;
