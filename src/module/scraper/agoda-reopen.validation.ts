import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const reopenAllReservationsSchema = z.object({
  job_ids: z.array(objectIdSchema).min(1, {
    message: 'job_ids must be a non-empty array of job ObjectIds',
  }),
});

export type ReopenAllReservationsType = z.infer<
  typeof reopenAllReservationsSchema
>;
