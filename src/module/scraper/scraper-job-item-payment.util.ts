/**
 * Country / region prefix before $ or ¥ → ISO 4217 (e.g. US$, AU$, MX$).
 * Longer keys are matched first when building prefix alternation.
 */
const DOLLAR_PREFIX_MAP: Record<string, string> = {
  US: 'USD',
  U: 'USD',
  AU: 'AUD',
  A: 'AUD',
  CA: 'CAD',
  C: 'CAD',
  NZ: 'NZD',
  HK: 'HKD',
  SG: 'SGD',
  S: 'SGD',
  MX: 'MXN',
  NT: 'TWD',
  TW: 'TWD',
  CN: 'CNY',
  R: 'BRL',
  Z: 'ZAR',
  AR: 'ARS',
  CL: 'CLP',
  CO: 'COP',
  PE: 'PEN',
  BR: 'BRL',
  T: 'THB',
  '': 'USD',
};

/** Multi-character currency symbols / tokens (matched before single-char symbols). */
const MULTI_SYMBOL_MAP: Record<string, string> = {
  'R$': 'BRL',
  'CA$': 'CAD',
  'C$': 'CAD',
  'A$': 'AUD',
  'AU$': 'AUD',
  'NZ$': 'NZD',
  'HK$': 'HKD',
  'S$': 'SGD',
  'SG$': 'SGD',
  'MX$': 'MXN',
  'NT$': 'TWD',
  'US$': 'USD',
  'U.S.$': 'USD',
  'U.S.': 'USD',
  'CN¥': 'CNY',
  'CNY¥': 'CNY',
  'RM': 'MYR',
  'kr': 'SEK',
  'Kr': 'SEK',
  'KR': 'SEK',
  'CHF': 'CHF',
  'zł': 'PLN',
  'ZL': 'PLN',
  'Kč': 'CZK',
  'KC': 'CZK',
  'lei': 'RON',
  'Lei': 'RON',
  'руб': 'RUB',
  'руб.': 'RUB',
};

/** Single-character symbol → ISO 4217. */
const SINGLE_SYMBOL_MAP: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '￥': 'JPY',
  '₩': 'KRW',
  '₹': 'INR',
  '₽': 'RUB',
  '₪': 'ILS',
  '₫': 'VND',
  '₱': 'PHP',
  '฿': 'THB',
  '₴': 'UAH',
  '₦': 'NGN',
  '₡': 'CRC',
  '₺': 'TRY',
  '₸': 'KZT',
  '₼': 'AZN',
  '₲': 'PYG',
  '₵': 'GHS',
  '₨': 'PKR',
  '₭': 'LAK',
  '₮': 'MNT',
  '₣': 'CHF',
  '₤': 'ITL',
  '₧': 'ESP',
  '﷼': 'IRR',
};

const MULTI_SYMBOL_KEYS = Object.keys(MULTI_SYMBOL_MAP).sort(
  (a, b) => b.length - a.length,
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(raw: string): string {
  return raw
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2000-\u200B\u202F\u205F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fullwidth digits and common punctuation → ASCII. */
function normalizeDigits(raw: string): string {
  return raw
    .replace(/[\uFF10-\uFF19]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
    .replace(/\uFF0E/g, '.')
    .replace(/\uFF0C/g, ',');
}

function extractSign(raw: string): { text: string; negative: boolean } {
  let text = raw.trim();
  let negative = false;

  const accounting = text.match(/^\(\s*(.+?)\s*\)$/);
  if (accounting) {
    negative = true;
    text = accounting[1].trim();
  }

  if (/^[-−–—]\s*/.test(text)) {
    negative = true;
    text = text.replace(/^[-−–—]\s*/, '');
  }

  return { text, negative };
}

/**
 * Parses localized numeric strings: 1,234.56 | 1.234,56 | 1'234.56 | 1234,56.
 */
function parseLocalizedNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return null;

  s = s.replace(/[''`´]/g, '');

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) {
      normalized = s.replace(/,/g, '');
    } else {
      normalized = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastComma >= 0) {
    const after = s.slice(lastComma + 1);
    if (/^\d{1,2}$/.test(after)) {
      normalized = s.replace(',', '.');
    } else {
      normalized = s.replace(/,/g, '');
    }
  } else if (lastDot >= 0) {
    const after = s.slice(lastDot + 1);
    const before = s.slice(0, lastDot);
    if (/^\d{3}$/.test(after) && before.length > 0 && before.length <= 3) {
      normalized = before + after;
    } else {
      normalized = s;
    }
  } else {
    normalized = s;
  }

  const n = parseFloat(normalized);
  return Number.isNaN(n) ? null : n;
}

function currencyFromDollarPrefix(prefix: string): string {
  const key = prefix.toUpperCase();
  return DOLLAR_PREFIX_MAP[key] ?? (key ? `${key}D` : 'USD');
}

function tryPeelPrefix(text: string): { remainder: string; currency: string } | null {
  const multiPattern = MULTI_SYMBOL_KEYS.map(escapeRegExp).join('|');
  const multiRe = new RegExp(
    `^(${multiPattern})\\s*([\\d].*)$`,
    'i',
  );
  const multiMatch = text.match(multiRe);
  if (multiMatch) {
    const token = multiMatch[1];
    const key =
      MULTI_SYMBOL_KEYS.find((k) => k.toLowerCase() === token.toLowerCase()) ??
      token;
    return {
      currency: MULTI_SYMBOL_MAP[key],
      remainder: multiMatch[2].trim(),
    };
  }

  const dollarRe = /^([A-Za-z]{0,3})\s*\$\s*([\d].*)$/;
  const dollarMatch = text.match(dollarRe);
  if (dollarMatch) {
    return {
      currency: currencyFromDollarPrefix(dollarMatch[1]),
      remainder: dollarMatch[2].trim(),
    };
  }

  const plainDollar = text.match(/^\$\s*([\d].*)$/);
  if (plainDollar) {
    return { currency: 'USD', remainder: plainDollar[1].trim() };
  }

  const singleSymbols = Object.keys(SINGLE_SYMBOL_MAP)
    .map(escapeRegExp)
    .join('|');
  const symbolRe = new RegExp(`^(${singleSymbols})\\s*([\\d].*)$`);
  const symbolMatch = text.match(symbolRe);
  if (symbolMatch) {
    return {
      currency: SINGLE_SYMBOL_MAP[symbolMatch[1]] ?? 'USD',
      remainder: symbolMatch[2].trim(),
    };
  }

  const isoPrefix = text.match(/^([A-Za-z]{3})\s*[:.\-]?\s*([\d].*)$/);
  if (isoPrefix) {
    return {
      currency: isoPrefix[1].toUpperCase(),
      remainder: isoPrefix[2].trim(),
    };
  }

  const isoParenPrefix = text.match(/^\(([A-Za-z]{3})\)\s*([\d].*)$/);
  if (isoParenPrefix) {
    return {
      currency: isoParenPrefix[1].toUpperCase(),
      remainder: isoParenPrefix[2].trim(),
    };
  }

  return null;
}

function tryPeelSuffix(text: string): { remainder: string; currency: string } | null {
  const isoSuffix = text.match(/^([\d][\d\s.,'−\-]*)\s*([A-Za-z]{3})$/);
  if (isoSuffix) {
    return {
      remainder: isoSuffix[1].trim(),
      currency: isoSuffix[2].toUpperCase(),
    };
  }

  const isoParenSuffix = text.match(/^([\d][\d\s.,'−\-]*)\s*\(([A-Za-z]{3})\)$/);
  if (isoParenSuffix) {
    return {
      remainder: isoParenSuffix[1].trim(),
      currency: isoParenSuffix[2].toUpperCase(),
    };
  }

  const multiPattern = MULTI_SYMBOL_KEYS.map(escapeRegExp).join('|');
  const multiSuffixRe = new RegExp(
    `^([\\d][\\d\\s.,'−\\-]*)\\s*(${multiPattern})$`,
    'i',
  );
  const multiSuffix = text.match(multiSuffixRe);
  if (multiSuffix) {
    const token = multiSuffix[2];
    const key =
      MULTI_SYMBOL_KEYS.find((k) => k.toLowerCase() === token.toLowerCase()) ??
      token;
    return {
      remainder: multiSuffix[1].trim(),
      currency: MULTI_SYMBOL_MAP[key],
    };
  }

  const singleSymbols = Object.keys(SINGLE_SYMBOL_MAP)
    .map(escapeRegExp)
    .join('|');
  const symbolSuffixRe = new RegExp(
    `^([\\d][\\d\\s.,'−\\-]*)\\s*(${singleSymbols})$`,
  );
  const symbolSuffix = text.match(symbolSuffixRe);
  if (symbolSuffix) {
    return {
      remainder: symbolSuffix[1].trim(),
      currency: SINGLE_SYMBOL_MAP[symbolSuffix[2]] ?? 'USD',
    };
  }

  return null;
}

function finalizeAmount(
  remainder: string,
  currency: string,
  negative: boolean,
): { amount: number; currency: string } | null {
  const amount = parseLocalizedNumber(remainder);
  if (amount === null) return null;
  return {
    amount: negative ? -Math.abs(amount) : amount,
    currency,
  };
}

/**
 * Parses amount strings from upload sheets. Supports many currency presentations:
 * - ISO codes: "CAD 235.78", "AED 287.05", "235.78 EUR", "(CAD) 100"
 * - Dollar prefixes: "US$202.63", "CA$50", "MX$100", "NT$200"
 * - Symbols: "£254.30", "€50,00", "₹1,200", "R$99.90", "฿500"
 * - Regional numbers: "1.234,56 EUR", "1'234.56 CHF", "1,234.56"
 * - Negatives: "-CAD 50", "(235.78)", "−100 USD"
 * - Plain: "$30", "464.74" (defaults currency to USD)
 */
export function parseAmount(
  raw: string,
): { amount: number; currency: string } | null {
  const normalized = normalizeDigits(normalizeWhitespace(String(raw ?? '')));
  if (!normalized) return null;

  const { text, negative } = extractSign(normalized);
  if (!text) return null;

  const noSpace = text.replace(/\s/g, '');

  const prefixPeel = tryPeelPrefix(text) ?? tryPeelPrefix(noSpace);
  if (prefixPeel) {
    return finalizeAmount(prefixPeel.remainder, prefixPeel.currency, negative);
  }

  const suffixPeel = tryPeelSuffix(text) ?? tryPeelSuffix(noSpace);
  if (suffixPeel) {
    return finalizeAmount(suffixPeel.remainder, suffixPeel.currency, negative);
  }

  const plain = parseLocalizedNumber(noSpace);
  if (plain !== null) {
    return {
      amount: negative ? -Math.abs(plain) : plain,
      currency: 'USD',
    };
  }

  return null;
}

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
