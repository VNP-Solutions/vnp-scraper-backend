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
