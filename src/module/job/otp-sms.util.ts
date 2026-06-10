import { getPhoneLastThreeDigitsKey } from '../phone-number-slot/phone-number-slot.utils';

const DEFAULT_OTP_SUPPORT_PHONE = '(571) 238-0638';
const DEFAULT_OTP_SUPPORT_EMAIL = 'ITSUPPORT@vnpsolutions.com';

type PhoneNumberSlotLike = {
  phone_number: string;
};

type JobPropertyLike = {
  phone_number?: string | null;
  phoneNumberSlot?: PhoneNumberSlotLike | null;
};

type JobForOtpSmsLike = {
  phone_number_for_report?: string | null;
  phoneNumberSlots?: PhoneNumberSlotLike[];
  property?: JobPropertyLike | null;
};

export function resolveOtpSmsMfaPhone(job: JobForOtpSmsLike): string | null {
  const phone =
    job.phoneNumberSlots?.[0]?.phone_number ??
    job.property?.phoneNumberSlot?.phone_number ??
    job.property?.phone_number;

  const trimmed = phone?.trim();
  return trimmed || null;
}

export function resolveOtpSmsDestinationPhone(job: JobForOtpSmsLike): string | null {
  const mfaPhone = resolveOtpSmsMfaPhone(job);
  if (mfaPhone) {
    return mfaPhone;
  }

  const reportPhone = job.phone_number_for_report?.trim();
  return reportPhone || null;
}

export function resolveOtpSmsLastThreeDigits(job: JobForOtpSmsLike): string | null {
  const mfaPhone = resolveOtpSmsMfaPhone(job);
  if (!mfaPhone) {
    return null;
  }

  const lastThree = getPhoneLastThreeDigitsKey(mfaPhone);
  return lastThree || null;
}

export function buildOtpReminderSmsBody(
  lastThreeDigits: string,
  supportPhone = DEFAULT_OTP_SUPPORT_PHONE,
  supportEmail = DEFAULT_OTP_SUPPORT_EMAIL,
): string {
  return `Hello,
Another OTP was sent to take from phone_number_slots (ending with the last 3 digits shown in the system: ${lastThreeDigits}). Could you please send that OTP to ${supportPhone} or forward it to ${supportEmail}?

Thank you!`;
}
