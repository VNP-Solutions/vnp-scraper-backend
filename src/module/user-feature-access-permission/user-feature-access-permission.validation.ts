import { z } from 'zod';

export const createUserFeatureAccessPermissionSchema = z.array(
  z.object({
    id: z.string().optional().nullable(),
    user_id: z.string({
      message: 'User ID is required',
    }),
    portfolio_id: z.string({
      message: 'Portfolio ID is required',
    }).optional().nullable(),
    sub_portfolio_id: z.string({
      message: 'Sub Portfolio ID is required',
    }).optional().nullable(),
    property_id: z.string({
      message: 'Property ID is required',
    }).optional().nullable(),
  })
);
