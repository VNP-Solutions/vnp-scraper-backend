import { z } from 'zod';

// MongoDB ObjectId validation
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid ObjectId format. Must be a 24-character hex string.',
});

export const createPropertySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  portfolioId: objectIdSchema.optional(),
  subPortfolioId: objectIdSchema.optional(),
  expediaId: z.number().optional(),
  expediaStatus: z.string().optional(),
  bookingId: z.number().optional(),
  bookingStatus: z.string().optional(),
  agodaId: z.number().optional(),
  agodaStatus: z.string().optional(),
  credentialsId: z.string().optional(),
});

export const updatePropertySchema = createPropertySchema;
