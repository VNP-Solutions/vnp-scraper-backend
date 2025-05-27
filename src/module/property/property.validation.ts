import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createPropertySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  portfolio_id: objectIdSchema.optional(),
  sub_portfolio_id: objectIdSchema.optional(),
  expedia_id: z.number().optional(),
  expedia_status: z.string().optional(),
  booking_id: z.number().optional(),
  booking_status: z.string().optional(),
  agoda_id: z.number().optional(),
  agoda_status: z.string().optional(),
});

export const updatePropertySchema = createPropertySchema;
