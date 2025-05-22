import { z } from 'zod';

export const createUserFeatureAccessPermissionSchema = z.object({
  user_id: z.string({
    message: 'User ID is required',
  }),
  portfolio_id: z.string({
    message: 'User ID is required',
  }).optional().nullable(),
  sub_portfolio_id: z.string({
    message: 'User ID is required',
  }).optional().nullable(),
  property_id: z.string({
    message: 'User ID is required',
  }).optional().nullable(),
});

export const updateUserFeatureAccessPermissionSchema = z.object({
  user_id: z.string({
    message: 'User ID is required',
  }),
  portfolio_id: z.string({
    message: 'User ID is required',
  }).optional().nullable(),
  sub_portfolio_id: z.string({
    message: 'User ID is required',
  }).optional().nullable(),
  property_id: z.string({
    message: 'User ID is required',
  }).optional().nullable(),
});