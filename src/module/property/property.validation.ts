import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createPropertySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  portfolio_id: objectIdSchema.optional().nullable(),
  sub_portfolio_id: objectIdSchema.optional().nullable(),
  expedia_id: z.number().optional().nullable(),
  expedia_status: z.string().optional().nullable(),
  booking_id: z.number().optional().nullable(),
  booking_status: z.string().optional().nullable(),
  agoda_id: z.number().optional().nullable(),
  agoda_status: z.string().optional().nullable(),
  user_email: z.string().email('Please provide a valid email address'),
  user_password: z
    .string()
    .min(6, 'Password must be at least 6 characters long'),
});

export const updatePropertySchema = createPropertySchema;
