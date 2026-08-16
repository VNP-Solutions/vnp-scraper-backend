import { QaPanelStatus } from '@prisma/client';
import { z } from 'zod';
import {
  normalizeQaPanelOtaPostImportCallbackStatus,
  normalizeQaPanelOtaPostStatus,
} from './qa-panel-ota-post-status.util';

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

const urlSchema = z.string().url('Invalid URL format');

export const qaPanelOtaPostStatusSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    return normalizeQaPanelOtaPostStatus(value) ?? value;
  },
  z.enum(['Processing', 'Success', 'Failed'], {
    errorMap: () => ({
      message: 'Status must be one of: Processing, Success, Failed',
    }),
  }),
);

export const qaPanelOtaPostListQuerySchema = z.object({
  search: z.string().optional(),
  status: qaPanelOtaPostStatusSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type QaPanelOtaPostListQueryType = z.infer<typeof qaPanelOtaPostListQuerySchema>;

export const qaPanelOtaPostFailedReasonSchema = z.object({
  row_number: z.number().int().min(1, 'Row number must be at least 1'),
  reason: z.string().min(1, 'Reason is required'),
});

export const createQaPanelOtaPostSchema = z.object({
  file_url: urlSchema,
  file_name: z.string().min(1, 'File name is required'),
  status: qaPanelOtaPostStatusSchema,
  failed_reasons: z.array(qaPanelOtaPostFailedReasonSchema).optional().default([]),
});

export const updateQaPanelOtaPostSchema = z.object({
  file_url: urlSchema.optional(),
  file_name: z.string().min(1, 'File name must not be empty').optional(),
  status: qaPanelOtaPostStatusSchema.optional(),
  failed_reasons: z.array(qaPanelOtaPostFailedReasonSchema).optional(),
});

export const bulkDeleteQaPanelOtaPostSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'At least one ID is required'),
});

export const qaPanelOtaPostImportCallbackErrorSchema = z.object({
  row: z.number().int().min(1, 'Row must be at least 1'),
  failed_reason: z.string().min(1, 'Failed reason is required'),
});

export const qaPanelOtaPostImportCallbackStatusSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    return normalizeQaPanelOtaPostImportCallbackStatus(value) ?? value;
  },
  z.enum(['success', 'failed'], {
    errorMap: () => ({
      message: "Status must be one of: success, failed",
    }),
  }),
);

export const qaPanelOtaPostImportCallbackSchema = z.object({
  qa_panel_id: objectIdSchema,
  email: z.string().email('Invalid email address'),
  status: qaPanelOtaPostImportCallbackStatusSchema,
  report: z.object({
    total: z.number().int().min(0),
    success: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),
  errors: z.array(qaPanelOtaPostImportCallbackErrorSchema).optional().default([]),
});

export type QaPanelOtaPostFailedReasonType = z.infer<typeof qaPanelOtaPostFailedReasonSchema>;
export type QaPanelOtaPostImportCallbackType = {
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

export type CreateQaPanelOtaPostType = {
  file_url: string;
  file_name: string;
  status: QaPanelStatus;
  failed_reasons?: QaPanelOtaPostFailedReasonType[];
};

export type UpdateQaPanelOtaPostType = {
  file_url?: string;
  file_name?: string;
  status?: QaPanelStatus;
  failed_reasons?: QaPanelOtaPostFailedReasonType[];
};

export type BulkDeleteQaPanelOtaPostType = z.infer<typeof bulkDeleteQaPanelOtaPostSchema>;
