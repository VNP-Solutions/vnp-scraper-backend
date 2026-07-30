import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

export const bookingPropertyRunJobSchema = z.object({
  booking_scraper_url_id: objectIdSchema,
  jobId: objectIdSchema,
});

export const bookingBulkPropertyRunJobGroupedSchema = z.object({
  booking_scraper_url_id: objectIdSchema,
  job_ids: z.array(objectIdSchema).min(1, 'At least one job ID is required'),
  scheduled_job_id: objectIdSchema.optional(),
});

export type BookingPropertyRunJobType = z.infer<
  typeof bookingPropertyRunJobSchema
>;
export type BookingBulkPropertyRunJobGroupedType = z.infer<
  typeof bookingBulkPropertyRunJobGroupedSchema
>;
