import { QaPanelStatus } from '@prisma/client';
import { z } from 'zod';
import {
  normalizeQaPanelImportCallbackStatus,
  normalizeQaPanelStatus,
} from './qa-panel-status.util';

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

const urlSchema = z.string().url('Invalid URL format');

export const qaPanelStatusSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    return normalizeQaPanelStatus(value) ?? value;
  },
  z.enum(['Processing', 'Success', 'Failed'], {
    errorMap: () => ({
      message: 'Status must be one of: Processing, Success, Failed',
    }),
  }),
);

export const qaPanelListQuerySchema = z.object({
  search: z.string().optional(),
  status: qaPanelStatusSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type QaPanelListQueryType = z.infer<typeof qaPanelListQuerySchema>;

export const qaPanelFailedReasonSchema = z.object({
  row_number: z.number().int().min(1, 'Row number must be at least 1'),
  reason: z.string().min(1, 'Reason is required'),
});

export const createQaPanelSchema = z.object({
  file_url: urlSchema,
  file_name: z.string().min(1, 'File name is required'),
  status: qaPanelStatusSchema,
  failed_reasons: z.array(qaPanelFailedReasonSchema).optional().default([]),
});

export const updateQaPanelSchema = z.object({
  file_url: urlSchema.optional(),
  file_name: z.string().min(1, 'File name must not be empty').optional(),
  status: qaPanelStatusSchema.optional(),
  failed_reasons: z.array(qaPanelFailedReasonSchema).optional(),
});

export const bulkDeleteQaPanelSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'At least one ID is required'),
});

export const qaPanelImportCallbackErrorSchema = z.object({
  row: z.number().int().min(1, 'Row must be at least 1'),
  failed_reason: z.string().min(1, 'Failed reason is required'),
});

export const qaPanelImportCallbackStatusSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    return normalizeQaPanelImportCallbackStatus(value) ?? value;
  },
  z.enum(['success', 'failed'], {
    errorMap: () => ({
      message: "Status must be one of: success, failed",
    }),
  }),
);

export const qaPanelImportCallbackSchema = z.object({
  qa_panel_id: objectIdSchema,
  email: z.string().email('Invalid email address'),
  status: qaPanelImportCallbackStatusSchema,
  report: z.object({
    total: z.number().int().min(0),
    success: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),
  errors: z.array(qaPanelImportCallbackErrorSchema).optional().default([]),
});

export type QaPanelFailedReasonType = z.infer<typeof qaPanelFailedReasonSchema>;
export type QaPanelImportCallbackType = {
  qa_panel_id: string;
  email: string;
  status: 'success' | 'failed';
  report: {
    total: number;
    success: number;
    failed: number;
  };
  errors?: {
    row: number;
    failed_reason: string;
  }[];
};

export type CreateQaPanelType = {
  file_url: string;
  file_name: string;
  status: QaPanelStatus;
  failed_reasons?: QaPanelFailedReasonType[];
};

export type UpdateQaPanelType = {
  file_url?: string;
  file_name?: string;
  status?: QaPanelStatus;
  failed_reasons?: QaPanelFailedReasonType[];
};

export type BulkDeleteQaPanelType = z.infer<typeof bulkDeleteQaPanelSchema>;
