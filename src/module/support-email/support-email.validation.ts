import { ReplyStatus } from '@prisma/client';
import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

export const runSupportEmailJobSchema = z.object({
  job_ids: z.array(objectIdSchema).min(1, 'At least one job ID is required'),
});

export type RunSupportEmailJobType = z.infer<typeof runSupportEmailJobSchema>;

export const updateSupportEmailReplyStatusSchema = z.object({
  reply_status: z.nativeEnum(ReplyStatus, {
    errorMap: () => ({
      message: `reply_status must be one of: ${Object.values(ReplyStatus).join(', ')}`,
    }),
  }),
});

export type UpdateSupportEmailReplyStatusType = z.infer<
  typeof updateSupportEmailReplyStatusSchema
>;
