import { QaPanelStatus } from '@prisma/client';

const QA_PANEL_OTA_POST_STATUS_ALIASES: Record<string, QaPanelStatus> = {
  processing: QaPanelStatus.Processing,
  Processing: QaPanelStatus.Processing,
  success: QaPanelStatus.Success,
  Success: QaPanelStatus.Success,
  failed: QaPanelStatus.Failed,
  Failed: QaPanelStatus.Failed,
};

export function normalizeQaPanelOtaPostStatus(value: string): QaPanelStatus | undefined {
  return QA_PANEL_OTA_POST_STATUS_ALIASES[value];
}

export function normalizeQaPanelOtaPostImportCallbackStatus(
  value: string,
): 'success' | 'failed' | undefined {
  const normalized = normalizeQaPanelOtaPostStatus(value);

  if (normalized === QaPanelStatus.Success) {
    return 'success';
  }

  if (normalized === QaPanelStatus.Failed) {
    return 'failed';
  }

  return undefined;
}

export const QA_PANEL_OTA_POST_STATUS_VALUES = [
  QaPanelStatus.Processing,
  QaPanelStatus.Success,
  QaPanelStatus.Failed,
] as const;
