import { z } from 'zod';

// MongoDB ObjectId validation regex
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// Date validation regex for MM/DD/YYYY format
const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;

export const bookingRunJobSchema = z.object({
  jobId: z
    .string({
      required_error: 'Job ID is required',
    })
    .regex(objectIdRegex, 'Invalid job ID format')
    .min(1, 'Job ID cannot be empty'),

  portfolioId: z
    .string({
      required_error: 'Portfolio ID is required',
    })
    .regex(objectIdRegex, 'Invalid portfolio ID format')
    .min(1, 'Portfolio ID cannot be empty'),

  propertyId: z
    .string()
    .regex(objectIdRegex, 'Invalid property ID format')
    .optional(),

  startDate: z
    .string({
      required_error: 'Start date is required',
    })
    .regex(dateRegex, 'Start date must be in MM/DD/YYYY format')
    .refine(
      (dateStr) => {
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
      },
      {
        message: 'Start date must be a valid date',
      },
    ),

  endDate: z
    .string({
      required_error: 'End date is required',
    })
    .regex(dateRegex, 'End date must be in MM/DD/YYYY format')
    .refine(
      (dateStr) => {
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
      },
      {
        message: 'End date must be a valid date',
      },
    ),
}).refine(
  (data) => {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    return startDate <= endDate;
  },
  {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  },
).refine(
  (data) => {
    const startDate = new Date(data.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return startDate <= today;
  },
  {
    message: 'Start date cannot be in the future',
    path: ['startDate'],
  },
);

export type BookingRunJobRequest = z.infer<typeof bookingRunJobSchema>;