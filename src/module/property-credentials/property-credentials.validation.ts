import { z } from 'zod';

export const createPropertyCredentialsSchema = z.object({
  expediaUsername: z.string().optional(),
  expediaPassword: z.string().optional(),
  agodaUsername: z.string().optional(),
  agodaPassword: z.string().optional(),
  bookingUsername: z.string().optional(),
  bookingPassword: z.string().optional(),
  expediaEmailAssociated: z.string().email().optional(),
  propertyContactEmail: z.string().email().optional(),
  portfolioContactEmail: z.string().email().optional(),
  multiplePortfolioEmails: z.array(z.string().email()).optional(),
  property_id: z.string().min(1, 'Property ID is required'),
});

export const updatePropertyCredentialsSchema = createPropertyCredentialsSchema;
