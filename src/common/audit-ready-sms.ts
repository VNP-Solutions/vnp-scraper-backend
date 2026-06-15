/**
 * Outbound SMS via Ejoin ACOM6xx gateway (primary) or Twilio (fallback).
 * Ejoin API: POST {gateway}/submit_sms_tasks
 */

export type SmsProvider = 'ejoin' | 'twilio';

export interface EjoinResponse {
  id?: number;
  code?: number;
  reason?: string;
}

export interface OutboundSmsResult {
  provider: SmsProvider;
  to: string;
  messageId: string;
}

function ejoinGatewayBase(): string | null {
  const url = process.env.EJOIN_SMS_GATEWAY_URL?.trim();
  return url ? url.replace(/\/+$/, '') : null;
}

function ejoinTaskId(): number {
  return Date.now() % 2_147_000_000;
}

function ejoinFromPort(): number | undefined {
  const raw = process.env.EJOIN_SMS_FROM_PORT?.trim();
  if (!raw) {
    return undefined;
  }
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 64) {
    return undefined;
  }
  return port;
}

function demoWebsiteUrl(): string | null {
  const url = process.env.DEMO_WEBSITE_URL?.trim();
  return url ? url.replace(/\/+$/, '') : null;
}

export function isEjoinSmsConfigured(): boolean {
  return Boolean(
    ejoinGatewayBase() &&
      process.env.EJOIN_SMS_USERNAME?.trim() &&
      process.env.EJOIN_SMS_PASSWORD?.trim(),
  );
}

export function isTwilioSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_PHONE_NUMBER?.trim(),
  );
}

/** Audit SMS needs a public app URL in the message body. */
export function isAuditSmsConfigured(): boolean {
  const demo = demoWebsiteUrl();
  if (!demo) {
    return false;
  }
  return isEjoinSmsConfigured() || isTwilioSmsConfigured();
}

/** Any outbound SMS (OTP reminder, audit, etc.) without requiring DEMO_WEBSITE_URL. */
export function isOutboundSmsConfigured(): boolean {
  return isEjoinSmsConfigured() || isTwilioSmsConfigured();
}

function resolveSmsProvider(): SmsProvider | null {
  const explicit = process.env.AUDIT_SMS_PROVIDER?.trim().toLowerCase();

  if (explicit === 'ejoin') {
    return isEjoinSmsConfigured() ? 'ejoin' : null;
  }
  if (explicit === 'twilio') {
    return isTwilioSmsConfigured() ? 'twilio' : null;
  }

  if (isEjoinSmsConfigured()) {
    return 'ejoin';
  }
  if (isTwilioSmsConfigured()) {
    return 'twilio';
  }
  return null;
}

function normalizePhoneForTwilio(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return trimmed;
}

export async function sendSmsViaEjoin(
  toPhone: string,
  message: string,
): Promise<{ to: string; messageId: string }> {
  const base = ejoinGatewayBase();
  const username = process.env.EJOIN_SMS_USERNAME?.trim();
  const password = process.env.EJOIN_SMS_PASSWORD?.trim();

  if (!base || !username || !password) {
    throw new Error(
      'Ejoin SMS is not configured. Set EJOIN_SMS_GATEWAY_URL, EJOIN_SMS_USERNAME, and EJOIN_SMS_PASSWORD.',
    );
  }

  const url = new URL(`${base}/submit_sms_tasks`);
  url.searchParams.set('username', username);
  url.searchParams.set('password', password);

  const task: Record<string, unknown> = {
    id: ejoinTaskId(),
    recipients: [toPhone.trim()],
    sms: message,
    charset: 'UTF-8',
    coding: 0,
    timeout: 30,
    to_all: false,
  };

  const fromPort = ejoinFromPort();
  if (fromPort !== undefined) {
    task.from = fromPort;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (/ngrok/i.test(base)) {
    headers['Ngrok-Skip-Browser-Warning'] = 'true';
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify([task]),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Ejoin HTTP ${res.status}: ${text}`);
  }

  let parsed: EjoinResponse[];
  try {
    parsed = JSON.parse(text) as EjoinResponse[];
  } catch {
    throw new Error(`Ejoin invalid JSON response: ${text}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Ejoin empty response: ${text}`);
  }

  const first = parsed[0];
  if (first.code !== undefined && first.code !== 0) {
    throw new Error(
      `Ejoin error code=${first.code} reason=${first.reason ?? 'unknown'}`,
    );
  }

  const messageId =
    first.id !== undefined ? String(first.id) : String(task.id as number);

  return {
    to: toPhone.trim(),
    messageId,
  };
}

async function sendSmsViaTwilio(
  toPhone: string,
  message: string,
): Promise<{ to: string; messageId: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      'Twilio SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.',
    );
  }

  const normalizedTo = normalizePhoneForTwilio(toPhone);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString(
    'base64',
  );

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: normalizedTo,
      From: fromNumber,
      Body: message,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Twilio HTTP ${res.status}: ${text}`);
  }

  let data: { sid?: string };
  try {
    data = JSON.parse(text) as { sid?: string };
  } catch {
    throw new Error(`Twilio invalid JSON response: ${text}`);
  }

  return {
    to: normalizedTo,
    messageId: data.sid ?? '',
  };
}

export async function sendOutboundSms(
  toPhone: string,
  message: string,
): Promise<OutboundSmsResult> {
  const provider = resolveSmsProvider();
  if (!provider) {
    throw new Error(
      'SMS is not configured. Set Ejoin (EJOIN_SMS_*) or Twilio (TWILIO_*) credentials.',
    );
  }

  const result =
    provider === 'ejoin'
      ? await sendSmsViaEjoin(toPhone, message)
      : await sendSmsViaTwilio(toPhone, message);

  return {
    provider,
    to: result.to,
    messageId: result.messageId,
  };
}

async function sendAuditSmsViaEjoin(
  toPhone: string,
  intro: string,
  link: string,
): Promise<void> {
  const smsBody = `${intro}\n${link}`;
  await sendSmsViaEjoin(toPhone, smsBody);
}

async function sendAuditSmsViaTwilio(
  toPhone: string,
  intro: string,
  link: string,
): Promise<void> {
  const smsBody = `${intro}\n${link}`;
  await sendSmsViaTwilio(toPhone, smsBody);
}

async function sendAuditSms(
  toPhone: string,
  intro: string,
  pathSegment: string,
  jobId: string,
): Promise<void> {
  if (!isAuditSmsConfigured()) {
    return;
  }

  const demo = demoWebsiteUrl();
  if (!demo) {
    return;
  }

  const link = `${demo}/${pathSegment}/${jobId}`;
  const provider = resolveSmsProvider();
  if (!provider) {
    return;
  }

  if (provider === 'ejoin') {
    await sendAuditSmsViaEjoin(toPhone, intro, link);
    return;
  }

  await sendAuditSmsViaTwilio(toPhone, intro, link);
}

/** Job accepted — sends progress link. Skips quietly if SMS is not configured. */
export async function sendAuditStartedSms(
  phone: string,
  jobId: string,
): Promise<void> {
  await sendAuditSms(
    phone,
    'Your Audit has started',
    'progress',
    jobId,
  );
}

/** Job completed — sends audit link. Skips quietly if SMS is not configured. */
export async function sendAuditReadySms(
  phone: string,
  jobId: string,
): Promise<void> {
  if (!isAuditSmsConfigured()) {
    return;
  }

  const demo = demoWebsiteUrl();
  if (!demo) {
    return;
  }

  const link = `${demo}/audits/${jobId}`;
  const message = `Your Audit is ready please take a look ${link}`;
  await sendOutboundSms(phone, message);
}
