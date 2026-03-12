/**
 * Sanitizes a value so it can be safely passed from MongoDB/Prisma to Node without
 * "Failed to convert rust String into napi string" or invalid UTF-8 issues.
 * - Removes null bytes from strings.
 * - Ensures string values are valid for JSON/serialization.
 */
function sanitizeString(s: unknown): string {
  if (s == null) return '';
  const str = typeof s === 'string' ? s : String(s);
  return str.replace(/\0/g, '');
}

/**
 * Recursively sanitize an object so all string values are safe (no null bytes, etc.).
 * Used when reading retrieval items via raw MongoDB to avoid Prisma Rust->Node conversion errors.
 */
export function sanitizeForExport<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return sanitizeString(value) as T;
  }
  // Preserve Date (and other non-plain-objects); otherwise they get turned into {} by the object branch
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForExport(item)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeForExport(v);
    }
    return out as T;
  }
  return value;
}
