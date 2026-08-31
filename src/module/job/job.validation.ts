import { JobStatus, OTAProvider, PostingType } from '@prisma/client';
import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createJobSchema = z.object({
  name: z.string().optional().nullable(),
  job_status: z.nativeEnum(JobStatus).default(JobStatus.Pending),
  portfolio_id: objectIdSchema.optional(),
  sub_portfolio_id: objectIdSchema.optional(),
  property_id: objectIdSchema.optional(),
  posting_type: z.nativeEnum(PostingType),
  portfolio_name: z
    .string()
    .min(1, 'Portfolio name is required')
    .optional()
    .nullable(),
  sub_portfolio_name: z
    .string()
    .min(1, 'Sub portfolio name is required')
    .optional()
    .nullable(),
  property_name: z.string().min(1, 'Property name is required'),
  billing_type: z
    .string()
    .min(1, 'Billing type is required')
    .optional()
    .nullable(),
  next_due_date: z.string(),
  schedule_date: z.string().optional().nullable(),
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
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  log_link: z.string().optional().nullable(),
  live_url: z.string().optional().nullable(),
  watcher_emails: z.array(z.string()).optional(),
  batch_id: z.union([objectIdSchema, z.null(), z.undefined()]).optional(),
  recurring_id: z.union([objectIdSchema, z.null(), z.undefined()]).optional(),
  server_id: z.union([objectIdSchema, z.null(), z.undefined()]).optional(),
  db_billing_duration: z.number().int().optional().nullable(),
  booking_vccs_filtered_reservation_count: z
    .number()
    .int()
    .optional()
    .nullable(),
  phone_number: z.string().optional().nullable(),
  slot: z.number().int().optional().nullable(),
  case_status: z.string().optional().nullable(),
  current_ss_step: z.string().optional().nullable(),
});

export const updateJobSchema = createJobSchema.partial();

export const createBatchSchema = z.object({
  name: z
    .string()
    .min(1, 'Batch name is required')
    .max(100, 'Batch name must be less than 100 characters'),
});

export const updateBatchSchema = createBatchSchema.partial();

export const bulkArchiveJobsSchema = z.object({
  job_ids: z.array(objectIdSchema).min(1, 'At least one job ID is required'),
  status: z.boolean({
    required_error: 'Status is required',
    invalid_type_error: 'Status must be a boolean',
  }),
});

export const bulkDeleteJobsSchema = z.object({
  job_ids: z.array(objectIdSchema).min(1, 'At least one job ID is required'),
});

export const bulkDeleteBatchesSchema = z.object({
  batch_ids: z.array(objectIdSchema).min(1, 'At least one batch ID is required'),
});

export const exportMasterJobsSchema = z.object({
  job_ids: z
    .array(objectIdSchema)
    .min(1, 'At least one job ID is required'),
});

export type CreateJobType = z.infer<typeof createJobSchema>;
export type UpdateJobType = z.infer<typeof updateJobSchema>;
export type CreateBatchType = z.infer<typeof createBatchSchema>;
export type UpdateBatchType = z.infer<typeof updateBatchSchema>;
export type BulkArchiveJobsType = z.infer<typeof bulkArchiveJobsSchema>;
export type BulkDeleteJobsType = z.infer<typeof bulkDeleteJobsSchema>;
export type BulkDeleteBatchesType = z.infer<typeof bulkDeleteBatchesSchema>;
export type ExportMasterJobsType = z.infer<typeof exportMasterJobsSchema>;
