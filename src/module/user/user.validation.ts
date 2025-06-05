import { z } from 'zod';

// MongoDB ObjectId validation regex
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// Phone number validation (basic international format)
const phoneRegex = /^\+?[1-9]\d{1,14}$/;

// Password validation (at least 6 characters, containing letters and numbers)
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/;

export const createUserSchema = z.object({
  email: z
    .string({
      required_error: 'Email is required',
    })
    .email('Invalid email format')
    .min(5, 'Email must be at least 5 characters long')
    .max(100, 'Email must not exceed 100 characters')
    .toLowerCase(),

  password: z
    .string({
      required_error: 'Password is required',
    })
    .min(6, 'Password must be at least 6 characters long')
    .max(128, 'Password must not exceed 128 characters'),
    // .regex(
    //   passwordRegex,
    //   'Password must contain at least one letter and one number',
    // ),

  name: z
    .string({
      required_error: 'Name is required',
    })
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters')
    .trim()
    .refine((val) => val.length > 0, {
      message: 'Name cannot be empty or only whitespace',
    }),

  role: z.enum(['admin', 'partial'], {
    required_error: 'Role is required',
    invalid_type_error: 'Role must be either admin or partial',
  }),

  image: z
    .string()
    .max(500, 'Image path must not exceed 500 characters')
    .optional()
    .nullable(),

  phone_number: z
    .string()
    .regex(
      phoneRegex,
      'Invalid phone number format (use international format like +1234567890)',
    )
    .max(20, 'Phone number must not exceed 20 characters')
    .optional()
    .nullable(),

  invited_user_id: z
    .string()
    .regex(objectIdRegex, 'Invalid invited user ID format')
    .optional()
    .nullable(),

  is_verified: z.boolean().optional().default(false),

  mfa_enabled: z.boolean().optional().default(false),

  mfa_secret: z
    .string()
    .max(100, 'MFA secret must not exceed 100 characters')
    .optional()
    .nullable(),

  last_login: z.date().optional().nullable(),
});

export const updateUserSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .min(5, 'Email must be at least 5 characters long')
    .max(100, 'Email must not exceed 100 characters')
    .toLowerCase()
    .optional(),

  password: z
    .string()
    .min(6, 'Password must be at least 6 characters long')
    .max(128, 'Password must not exceed 128 characters')
    // .regex(
    //   passwordRegex,
    //   'Password must contain at least one letter and one number',
    // )
    .optional(),

  name: z
    .string()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters')
    .trim()
    .refine((val) => val.length > 0, {
      message: 'Name cannot be empty or only whitespace',
    })
    .optional(),

  role: z
    .enum(['admin', 'partial'], {
      invalid_type_error: 'Role must be either admin or partial',
    })
    .optional(),

  image: z
    .string()
    .max(500, 'Image path must not exceed 500 characters')
    .optional()
    .nullable(),

  phone_number: z
    .string()
    .regex(
      phoneRegex,
      'Invalid phone number format (use international format like +1234567890)',
    )
    .max(20, 'Phone number must not exceed 20 characters')
    .optional()
    .nullable(),

  invited_user_id: z
    .string()
    .regex(objectIdRegex, 'Invalid invited user ID format')
    .optional()
    .nullable(),

  is_verified: z.boolean().optional(),

  download_report: z.boolean().optional(),
});

// Additional validation for business logic
export const createUserBusinessRules = z
  .object({
    // Ensure admin users are verified by default
    role: z.enum(['admin', 'partial']),
    is_verified: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // If role is admin and is_verified is explicitly set to false, reject
      if (data.role === 'admin' && data.is_verified === false) {
        return false;
      }
      return true;
    },
    {
      message: 'Admin users must be verified',
      path: ['is_verified'],
    },
  );

// Validation for user update with business rules
export const updateUserBusinessRules = z
  .object({
    email: z.string().email().optional(),
    role: z.enum(['admin', 'partial']).optional(),
    is_verified: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // If updating role to admin, user should be verified
      if (data.role === 'admin' && data.is_verified === false) {
        return false;
      }
      return true;
    },
    {
      message: 'Admin users must be verified',
      path: ['is_verified'],
    },
  );

// Export combined schemas that include business rules
export const createUserWithBusinessRulesSchema = createUserSchema.and(
  createUserBusinessRules,
);
export const updateUserWithBusinessRulesSchema = updateUserSchema.and(
  updateUserBusinessRules,
);
