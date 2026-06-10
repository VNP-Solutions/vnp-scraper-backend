import { OTAProvider } from '@prisma/client';
import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createJobOtpSchema = z.object({
  otp: z.string().min(1, 'otp is required'),
  ota: z.nativeEnum(OTAProvider),
  job_id: objectIdSchema,
});

export const updateJobOtpSchema = z.object({
  otp: z.string().min(1).optional(),
  ota: z.nativeEnum(OTAProvider).optional(),
  job_id: objectIdSchema.optional(),
});
