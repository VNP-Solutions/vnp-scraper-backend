import { z } from 'zod';

export const createInvitationSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    role: z.enum(['admin', 'partial'], {
      message: 'Role must be either admin or partial',
    }),
    message: z.string().optional().nullable(),
    portfolio_ids: z.array(z.string()).optional().default([]),
    sub_portfolio_ids: z.array(z.string()).optional().default([]),
    property_ids: z.array(z.string()).optional().default([]),
  })
  .refine(
    data => {
      // If role is admin and any permission arrays are provided, it's still valid but will be ignored
      if (
        data.role === 'admin' &&
        ((data.portfolio_ids && data.portfolio_ids.length > 0) ||
          (data.sub_portfolio_ids && data.sub_portfolio_ids.length > 0) ||
          (data.property_ids && data.property_ids.length > 0))
      ) {
        // This is just for documentation - the service will clear these arrays
        return true;
      }
      return true;
    },
    {
      message:
        'Permission arrays are not needed for admin role (they will be ignored)',
    },
  );

export const acceptInvitationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  phone_number: z.string().optional().nullable(),
});

export const updateInvitationSchema = z
  .object({
    status: z.enum(['Pending', 'Accepted', 'Expired', 'Cancelled']).optional(),
    role: z.enum(['admin', 'partial']).optional(),
    message: z.string().optional().nullable(),
    portfolio_ids: z.array(z.string()).optional(),
    sub_portfolio_ids: z.array(z.string()).optional(),
    property_ids: z.array(z.string()).optional(),
  })
  .refine(data => {
    // If changing role to admin, permission arrays will be cleared
    if (
      data.role === 'admin' &&
      ((data.portfolio_ids && data.portfolio_ids.length > 0) ||
        (data.sub_portfolio_ids && data.sub_portfolio_ids.length > 0) ||
        (data.property_ids && data.property_ids.length > 0))
    ) {
      return true; // Allow but will be handled in service
    }
    return true;
  });

export const resendInvitationSchema = z.object({
  message: z.string().optional().nullable(),
});
