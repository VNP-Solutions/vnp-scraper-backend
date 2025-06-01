import { RoleEnum } from '@prisma/client';
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z
    .string({
      required_error: 'Email is required',
    })
    .email('Please provide a valid email address'),

  password: z
    .string({
      required_error: 'Password is required',
      invalid_type_error: 'Password must be a string',
    })
    .min(8, 'Password must be at least 8 characters long')
    .max(32, 'Password must be at most 32 characters long'),
  // .regex(
  //   /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/,
  //   'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character'
  // ),
});

export const RegisterSchema = LoginSchema.extend({
  name: z
    .string({
      required_error: 'Name is required',
    })
    .min(2, 'Name must be at least 2 characters long'),

  role: z.nativeEnum(RoleEnum, {
    required_error: 'Role is required',
    invalid_type_error:
      'Invalid role. Must be one of: admin, portfolio, sub_portfolio, property',
  }),
});

export const VerifyOtpSchema = z.object({
  email: z
    .string({
      required_error: 'Email is required',
    })
    .email('Please provide a valid email address'),

  otp: z
    .string({
      required_error: 'OTP is required',
    })
    .length(6, 'OTP must be 6 characters long'),
});

export const ForgotPasswordSchema = z.object({
  email: z
    .string({
      required_error: 'Email is required',
    })
    .email('Please provide a valid email address'),
});

export const ValidateResetOtpSchema = z.object({
  email: z
    .string({
      required_error: 'Email is required',
    })
    .email('Please provide a valid email address'),

  otp: z
    .string({
      required_error: 'OTP is required',
    })
    .length(6, 'OTP must be 6 characters long'),
});

export const ResetPasswordSchema = z.object({
  resetToken: z
    .string({
      required_error: 'Reset token is required',
    })
    .min(1, 'Reset token cannot be empty'),

  newPassword: z
    .string({
      required_error: 'New password is required',
      invalid_type_error: 'New password must be a string',
    })
    .min(8, 'Password must be at least 8 characters long')
    .max(32, 'Password must be at most 32 characters long'),
  // .regex(
  //   /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/,
  //   'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character'
  // ),
});
