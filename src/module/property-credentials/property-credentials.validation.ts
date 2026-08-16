import { z } from 'zod';

export const createPropertyCredentialsSchema = z.object({
  expediaUsername: z.string().optional().nullable(),
  expediaPassword: z.string().optional().nullable(),
  agodaUsername: z.string().optional().nullable(),
  agodaPassword: z.string().optional().nullable(),
  bookingUsername: z.string().optional().nullable(),
  bookingPassword: z.string().optional().nullable(),
  expediaEmailAssociated: z.string().email().optional().nullable(),
  propertyContactEmail: z.string().email().optional().nullable(),
  portfolioContactEmail: z.string().email().optional().nullable(),
  multiplePortfolioEmails: z.array(z.string().email()).optional().nullable(),
  property_id: z.string().min(1, 'Property ID is required'),
});

export const updatePropertyCredentialsSchema = createPropertyCredentialsSchema;

// Special schema for bulk updates - allows empty strings and doesn't require property_id
export const bulkUpdateCredentialsSchema = z.object({
  expediaUsername: z.string().optional().nullable(),
  expediaPassword: z.string().optional().nullable(),
  agodaUsername: z.string().optional().nullable(),
  agodaPassword: z.string().optional().nullable(),
  bookingUsername: z.string().optional().nullable(),
  bookingPassword: z.string().optional().nullable(),
  expediaEmailAssociated: z.string().optional().nullable(), // Remove email validation for bulk updates
  propertyContactEmail: z.string().optional().nullable(), // Remove email validation for bulk updates
  portfolioContactEmail: z.string().optional().nullable(), // Remove email validation for bulk updates
  multiplePortfolioEmails: z.array(z.string()).optional().nullable(), // Remove email validation for bulk updates
});

export const bulkUpdatePropertyCredentialsSchema = z.object({
  propertyIds: z
    .array(z.string().min(1, 'Property ID cannot be empty'))
    .min(1, 'At least one property ID is required'),
  credentials: bulkUpdateCredentialsSchema,
});
