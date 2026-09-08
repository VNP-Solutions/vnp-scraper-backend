import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

export const runSendToRetrievalJobSchema = z.object({
  job_ids: z.array(objectIdSchema).min(1, 'At least one job ID is required'),
});

export type RunSendToRetrievalJobType = z.infer<
  typeof runSendToRetrievalJobSchema
>;
