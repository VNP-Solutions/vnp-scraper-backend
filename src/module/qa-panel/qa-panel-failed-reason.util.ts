export type QaPanelFailedReasonInput = {
  row_number: number;
  reason: string;
};

export function extractFailedReasonsFromProxyResponse(
  proxyResponse: unknown,
): QaPanelFailedReasonInput[] {
  if (!proxyResponse || typeof proxyResponse !== 'object') {
    return [];
  }

  const payload = proxyResponse as Record<string, unknown>;
  const candidates = [
    payload.failed_reasons,
    payload.failedReasons,
    (payload.data as Record<string, unknown> | undefined)?.failed_reasons,
    (payload.data as Record<string, unknown> | undefined)?.failedReasons,
    payload.errors,
  ];

  for (const candidate of candidates) {
    const parsed = parseFailedReasons(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

function parseFailedReasons(value: unknown): QaPanelFailedReasonInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeFailedReason(item))
    .filter((item): item is QaPanelFailedReasonInput => item !== null);
}

function normalizeFailedReason(
  item: unknown,
): QaPanelFailedReasonInput | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const rowNumber = record.row_number ?? record.rowNumber ?? record.row;
  const reason = record.reason ?? record.message ?? record.error;

  if (
    typeof rowNumber !== 'number' ||
    !Number.isInteger(rowNumber) ||
    rowNumber < 1 ||
    typeof reason !== 'string' ||
    !reason.trim()
  ) {
    return null;
  }

  return {
    row_number: rowNumber,
    reason: reason.trim(),
  };
}
