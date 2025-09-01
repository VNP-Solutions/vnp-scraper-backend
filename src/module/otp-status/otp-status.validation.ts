import { z } from 'zod';

export const createOtpStatusSchema = z.object({
  status: z.enum(['Occupied', 'Released']),
  job_id: z.string().min(1).nullable().optional(),
});

export const updateOtpStatusSchema = z.object({
  status: z.enum(['Occupied', 'Released']).optional(),
  job_id: z.string().min(1).nullable().optional(),
});
