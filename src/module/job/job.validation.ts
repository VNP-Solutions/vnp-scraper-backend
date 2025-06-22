import { z } from 'zod';
import { JobStatus, PostingType, OTAProvider } from '@prisma/client';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createJobSchema = z.object({
  job_status: z.nativeEnum(JobStatus).default(JobStatus.Pending),
  portfolio_id: objectIdSchema.optional(),
  sub_portfolio_id: objectIdSchema.optional(),
  property_id: objectIdSchema.optional(),
  posting_type: z.nativeEnum(PostingType),
  portfolio_name: z.string().min(1, 'Portfolio name is required').optional().nullable(),
  sub_portfolio_name: z.string().min(1, 'Sub portfolio name is required').optional().nullable(),
  property_name: z.string().min(1, 'Property name is required'),
  billing_type: z.string().min(1, 'Billing type is required').optional().nullable(),
  next_due_date: z.string(),
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
});

export const updateJobSchema = createJobSchema.partial();

export type CreateJobType = z.infer<typeof createJobSchema>;
export type UpdateJobType = z.infer<typeof updateJobSchema>;