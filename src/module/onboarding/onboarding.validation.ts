import { z } from 'zod';

export const createOnboardingSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().min(1, 'Company is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(1, 'Phone is required'),
  number_of_hotels: z.coerce
    .number()
    .int()
    .positive('Number of hotels must be a positive integer'),
});
