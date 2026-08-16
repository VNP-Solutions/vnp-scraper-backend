import { z } from 'zod';

export const createOtpStatusSchema = z.object({
  status: z.enum(['Occupied', 'Released']),
  platform: z.enum(['expedia', 'agoda', 'booking']).optional(),
  job_id: z.string().min(1).nullable().optional(),
});

export const updateOtpStatusSchema = z.object({
  status: z.enum(['Occupied', 'Released']).optional(),
  platform: z.enum(['expedia', 'agoda', 'booking']).optional(),
  job_id: z.string().min(1).nullable().optional(),
});
