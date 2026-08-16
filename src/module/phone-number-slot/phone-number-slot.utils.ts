/**
 * Strips non-digits and returns the last 3 digits for uniqueness checks.
 * If fewer than 3 digit characters exist, uses all digits (short codes).
 */
export function getPhoneLastThreeDigitsKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) {
    return '';
  }
  return digits.length >= 3 ? digits.slice(-3) : digits;
}
