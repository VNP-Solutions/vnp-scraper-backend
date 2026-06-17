import { QaPanelStatus } from '@prisma/client';

const QA_PANEL_STATUS_ALIASES: Record<string, QaPanelStatus> = {
  processing: QaPanelStatus.Processing,
  Processing: QaPanelStatus.Processing,
  success: QaPanelStatus.Success,
  Success: QaPanelStatus.Success,
  failed: QaPanelStatus.Failed,
  Failed: QaPanelStatus.Failed,
};

export function normalizeQaPanelStatus(value: string): QaPanelStatus | undefined {
  return QA_PANEL_STATUS_ALIASES[value];
}

export const QA_PANEL_STATUS_VALUES = [
  QaPanelStatus.Processing,
  QaPanelStatus.Success,
  QaPanelStatus.Failed,
] as const;
