function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeDateToYyyyMmDd(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    return formatDateParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
  }

  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const input = String(value).trim();
  if (!input) return null;

  const yearFirstMatch = input.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D.*)?$/,
  );
  if (yearFirstMatch) {
    const [, year, month, day] = yearFirstMatch.map(Number);
    return isValidDateParts(year, month, day)
      ? formatDateParts(year, month, day)
      : null;
  }

  const compactMatch = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, year, month, day] = compactMatch.map(Number);
    return isValidDateParts(year, month, day)
      ? formatDateParts(year, month, day)
      : null;
  }

  const dayOrMonthFirstMatch = input.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/,
  );
  if (dayOrMonthFirstMatch) {
    const first = Number(dayOrMonthFirstMatch[1]);
    const second = Number(dayOrMonthFirstMatch[2]);
    const year = Number(dayOrMonthFirstMatch[3]);
    const [month, day] = first > 12 ? [second, first] : [first, second];

    return isValidDateParts(year, month, day)
      ? formatDateParts(year, month, day)
      : null;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;

  return formatDateParts(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
  );
}
