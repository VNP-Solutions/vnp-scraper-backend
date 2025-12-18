import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createParentRetrievalSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  ota_provider: z.enum(['Expedia', 'Booking', 'Agoda']).optional(),
});

export const updateParentRetrievalSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  ota_provider: z.enum(['Expedia', 'Booking', 'Agoda']).optional(),
  is_archived: z.boolean().optional(),
});

export const createRetrievalSchema = z.object({
  name: z.string().optional(),
  job_status: z
    .enum(['Pending', 'Running', 'Completed', 'Partial', 'Failed', 'Stopped'])
    .optional(),
  portfolio_id: z.string().optional(),
  sub_portfolio_id: z.string().optional(),
  property_id: z.string().optional(),
  user_id: z.string().min(1, 'User ID is required'),
  batch_id: z.string().optional(),
  parent_retrieval_id: z.string().min(1, 'Parent retrieval ID is required'),
  posting_type: z.enum(['OTA', 'OTA_PLUS']),
  portfolio_name: z.string().optional(),
  sub_portfolio_name: z.string().optional(),
  property_name: z.string().min(1, 'Property name is required'),
  billing_type: z.string().optional(),
  next_due_date: z.string().or(z.date()).optional(),
  ota_provider: z.enum(['Expedia', 'Booking', 'Agoda']),
  remaining_direct_billed: z.number(),
  total_collectable: z.number(),
  total_amount_confirmed: z.number(),
  execution_type: z.string().min(1, 'Execution type is required'),
  retries_attempted: z.number().optional().default(0),
  max_retries: z.number().optional().default(3),
  retry_delay_ms: z.number().optional(),
  priority: z.number().optional().default(0),
  job_backoff_length_loading: z.number(),
  job_backoff_length_selector: z.number(),
  queue_name: z.string().optional(),
  worker_assigned: z.string().optional(),
  batch_execution_id: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  log_link: z.string().optional(),
  live_url: z.string().optional(),
  current_url: z.string().optional(),
  case_open: z.boolean().optional().default(false),
  watcher_emails: z.array(z.string()).optional(),
  reservations: z.array(z.string()).optional(),
  amount_to_charge_or_refund_currency: z.string().nullable().optional(),
});

export const updateRetrievalSchema = z.object({
  name: z.string().optional(),
  job_status: z
    .enum(['Pending', 'Running', 'Completed', 'Partial', 'Failed', 'Stopped'])
    .optional(),
  portfolio_name: z.string().optional(),
  sub_portfolio_name: z.string().optional(),
  property_name: z.string().optional(),
  billing_type: z.string().optional(),
  next_due_date: z.string().or(z.date()).optional(),
  ota_provider: z.enum(['Expedia', 'Booking', 'Agoda']).optional(),
  remaining_direct_billed: z.number().optional(),
  total_collectable: z.number().optional(),
  total_amount_confirmed: z.number().optional(),
  execution_type: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  log_link: z.string().optional(),
  live_url: z.string().optional(),
  reservations: z.array(z.string()).optional(),
  amount_to_charge_or_refund_currency: z.string().nullable().optional(),
});

export const bulkArchiveParentRetrievalsSchema = z.object({
  parent_retrieval_ids: z
    .array(objectIdSchema)
    .min(1, 'At least one parent retrieval ID is required'),
  status: z.boolean({
    required_error: 'Status is required',
    invalid_type_error: 'Status must be a boolean',
  }),
});

export const bulkDeleteParentRetrievalsSchema = z.object({
  parent_retrieval_ids: z
    .array(objectIdSchema)
    .min(1, 'At least one parent retrieval ID is required'),
});
