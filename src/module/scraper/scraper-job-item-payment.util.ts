/**
 * Reads `payment_info.amount_to_charge_or_refund_currency` from Prisma / Mongo payloads.
 * Used for both `total_guest_payment_currency` and `amount_to_charge_or_refund_currency` in API responses
 * (schema only stores one currency field on PaymentInfo).
 */
export function readPaymentCurrencyCode(paymentInfo: unknown): string | null {
  if (paymentInfo == null || typeof paymentInfo !== 'object') {
    return null;
  }
  const v = (paymentInfo as Record<string, unknown>)
    .amount_to_charge_or_refund_currency;
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}
