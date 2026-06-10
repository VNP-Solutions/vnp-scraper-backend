import { getPhoneLastThreeDigitsKey } from '../phone-number-slot/phone-number-slot.utils';

const DEFAULT_OTP_SUPPORT_PHONE = '(571) 238-0638';
const DEFAULT_OTP_SUPPORT_EMAIL = 'ITSUPPORT@vnpsolutions.com';

type PhoneNumberSlotLike = {
  id?: string;
  phone_number: string;
  slot?: number;
};

type JobPropertyLike = {
  phone_number?: string | null;
  phone_number_slot_id?: string | null;
  slot?: number | null;
  phoneNumberSlot?: PhoneNumberSlotLike | null;
};

type JobForOtpSmsLike = {
  property_id?: string | null;
  phone_number_for_report?: string | null;
  property?: JobPropertyLike | null;
};

/**
 * Job → property → phone_number_slot_id → phone_number_slots.phone_number
 */
export function resolveOtpSmsMfaPhone(job: JobForOtpSmsLike): string | null {
  const slotPhone = job.property?.phoneNumberSlot?.phone_number;
  const trimmed = slotPhone?.trim();
  return trimmed || null;
}

export function resolveOtpSmsDestinationPhone(job: JobForOtpSmsLike): string | null {
  const reportPhone = job.phone_number_for_report?.trim();
  if (reportPhone) {
    return reportPhone;
  }

  const propertyPhone = job.property?.phone_number?.trim();
  return propertyPhone || null;
}

export function resolveOtpSmsLastThreeDigits(job: JobForOtpSmsLike): string | null {
  const mfaPhone = resolveOtpSmsMfaPhone(job);
  if (!mfaPhone) {
    return null;
  }

  const lastThree = getPhoneLastThreeDigitsKey(mfaPhone);
  return lastThree || null;
}

/** e.g. 15551205205 → 15...205 (first 2 digit chars + last 3 digit chars) */
export function formatPhoneFirstTwoLastThree(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) {
    return phone.trim();
  }

  const firstTwo = digits.slice(0, Math.min(2, digits.length));
  const lastThree = digits.slice(-Math.min(3, digits.length));
  return `${firstTwo}...${lastThree}`;
}

export function buildOtpReminderSmsBody(
  phoneNumber: string,
  lastThreeDigits: string,
  supportPhone = DEFAULT_OTP_SUPPORT_PHONE,
  supportEmail = DEFAULT_OTP_SUPPORT_EMAIL,
): string {
  const maskedPhone = formatPhoneFirstTwoLastThree(phoneNumber);

  return `Hello,
Another OTP was sent to take from ${maskedPhone} (ending with the last 3 digits shown in the system: ${lastThreeDigits}). Could you please send that OTP to ${supportPhone} or forward it to ${supportEmail}?

Thank you!`;
}
