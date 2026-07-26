/**
 * Formats dates as MM/DD/YYYY for bulk job-items import compatibility.
 * Job `end_date` strings are normalized in-place when already slash-separated.
 */
export function formatImportCompatibleDate(
  value: Date | string | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const mm = slashMatch[1].padStart(2, '0');
      const dd = slashMatch[2].padStart(2, '0');
      return `${mm}/${dd}/${slashMatch[3]}`;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getUTCDate()).padStart(2, '0');
      const yyyy = parsed.getUTCFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }

    return trimmed;
  }

  const mm = String(value.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(value.getUTCDate()).padStart(2, '0');
  const yyyy = value.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
