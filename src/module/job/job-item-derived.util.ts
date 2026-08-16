/**
 * Shared logic for the two "derived" fields exposed on Expedia job items:
 *   - over_160:              true if (today - check_out_date) is more than 160 days
 *   - days_since_checkout:   whole-day count from check_out_date to "today"
 *
 * Used by two callers:
 *   1) ScraperJobItemService — decorates rows returned by the
 *      GET /scraper/api/jobs/:jobId/items and /all-items APIs with a
 *      Mongo-backed lazy cache (the JobItem document stores the last
 *      computed values + `derived_calculated_at` and we recompute only
 *      when stale).
 *   2) master-export.util.ts — populates the corresponding columns in
 *      the master CSV export.
 *
 * IMPORTANT: this calculation is Expedia-only. For Booking and Agoda
 * job items both values stay `null` (the API returns null, the CSV
 * shows "N/A"). Callers must short-circuit when ota_provider !== "Expedia"
 * before invoking the cache/refresh path.
 */

export interface DerivedJobItemFields {
  over_160: boolean | null;
  days_since_checkout: number | null;
}

/**
 * Returns the start of the calendar day for `d`, in the host timezone,
 * with milliseconds zeroed. Used both as the freshness comparison
 * anchor and to keep the day-count free from DST/sub-day noise.
 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const fromDay = Date.UTC(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  );
  const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((toDay - fromDay) / msPerDay);
}

/**
 * Computes both derived fields from `check_out_date` and an anchor
 * "today". Returns both as `null` if the check-out date is missing or
 * unparseable (mirrors the Booking-row behaviour in the master export).
 *
 * Callers that have already filtered out non-Expedia rows can use this
 * directly; the function itself does NOT know about OTA provider, so
 * Booking/Agoda callers must short-circuit before calling.
 */
export function computeDerivedJobItemFields(
  checkOutDate: Date | string | null | undefined,
  today: Date = new Date(),
): DerivedJobItemFields {
  if (!checkOutDate) {
    return { over_160: null, days_since_checkout: null };
  }
  const d = checkOutDate instanceof Date ? checkOutDate : new Date(checkOutDate);
  if (isNaN(d.getTime())) {
    return { over_160: null, days_since_checkout: null };
  }
  const days = daysBetween(d, today);
  return { over_160: days > 160, days_since_checkout: days };
}

/**
 * True iff the cached derived values on a JobItem are still valid for
 * "today". Specifically: `derived_calculated_at` exists and is at or
 * after today's local midnight. A null/missing timestamp is treated as
 * stale (forces an initial computation).
 */
export function isDerivedFresh(
  derivedCalculatedAt: Date | null | undefined,
  today: Date = new Date(),
): boolean {
  if (!derivedCalculatedAt) return false;
  const calc =
    derivedCalculatedAt instanceof Date
      ? derivedCalculatedAt
      : new Date(derivedCalculatedAt);
  if (isNaN(calc.getTime())) return false;
  return calc.getTime() >= startOfDay(today).getTime();
}
