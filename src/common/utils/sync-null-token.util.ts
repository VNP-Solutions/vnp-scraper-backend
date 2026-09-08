/**
 * The DBMS sends the literal string 'NULL' for a column one of its bulk uploads
 * cleared. Its sync payloads omit any key they don't carry a value for, and an
 * omitted key means "leave the stored value alone" here — so a deliberate clear
 * has to arrive as something other than an absent key, and this token is it.
 */
export const SYNC_NULL_TOKEN = 'NULL';

export function isSyncNullToken(value: unknown): boolean {
  return (
    typeof value === 'string' && value.trim().toUpperCase() === SYNC_NULL_TOKEN
  );
}

/**
 * Turns a cleared field into the `null` Prisma needs to unset a column, and
 * leaves everything else — including `undefined`, which Prisma reads as "don't
 * touch this column" — exactly as it arrived.
 */
export function resolveSyncedValue<T>(value: T): T | null {
  return isSyncNullToken(value) ? null : value;
}
