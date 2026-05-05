import { z } from 'zod';

export const createOtpCodeSchema = z.object({
  provider: z.enum(['Expedia', 'Booking', 'Agoda']),
  otp_code: z
    .string()
    .regex(/^\d{6}$/, 'otp_code must be a 6-digit numeric string'),
  job_id: z.string().min(1).nullable().optional(),
});
