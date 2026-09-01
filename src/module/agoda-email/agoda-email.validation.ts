import { z } from 'zod';
import { normalizeDateToYyyyMmDd } from '../../common/utils/normalize-date.util';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

const dateStringSchema = z.unknown().transform((value, context) => {
  const normalizedDate = normalizeDateToYyyyMmDd(value);

  if (!normalizedDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid date',
    });
    return z.NEVER;
  }

  return normalizedDate;
});

export const createAgodaEmailSchema = z.object({
  job_id: objectIdSchema,
  email_id: z.string().min(1, 'Email id is required'),
  subject: z.string().optional().nullable(),
  email_body: z.string().optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  point_status: z.string().optional().nullable(),
  date: dateStringSchema.optional().nullable(),
  screenshots: z.array(z.string()).optional(),
});

export const updateAgodaEmailSchema = createAgodaEmailSchema.partial();

export type CreateAgodaEmailType = z.infer<typeof createAgodaEmailSchema>;
export type UpdateAgodaEmailType = z.infer<typeof updateAgodaEmailSchema>;
