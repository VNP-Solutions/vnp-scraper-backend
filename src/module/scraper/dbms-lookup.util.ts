import { UpdatePropertyCredentialsDto } from '../property-credentials/property-credentials.dto';

export type DbmsOtaProvider = 'expedia' | 'agoda' | 'booking';

export type DbmsExtractedExpediaCredentials = {
  expediaUsername: string;
  expediaPassword: string;
};

export type DbmsExtractedAgodaCredentials = {
  agodaUsername: string;
  agodaPassword: string;
};

export type DbmsExtractedBookingCredentials = {
  bookingUsername: string;
  bookingPassword: string;
};

export type DbmsExtractedOtaCredentials =
  | DbmsExtractedExpediaCredentials
  | DbmsExtractedAgodaCredentials
  | DbmsExtractedBookingCredentials;

type DbmsCredentialSlot = {
  expediaUsername?: string | null;
  expediaPassword?: string | null;
  expediaSecondaryUsername?: string | null;
  expediaSecondaryPassword?: string | null;
  agodaUsername?: string | null;
  agodaPassword?: string | null;
  agodaSecondaryUsername?: string | null;
  agodaSecondaryPassword?: string | null;
  bookingUsername?: string | null;
  bookingPassword?: string | null;
  bookingSecondaryUsername?: string | null;
  bookingSecondaryPassword?: string | null;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Resolves the first credential record from DBMS payloads:
 * - Row: `data[0]` when `data` is an array, or `data` itself when it is a single row object.
 * - `credentials`: a single object (current API) or `credentials[0]` (legacy array).
 */
function getFirstDbmsCredentialSlot(data: unknown): DbmsCredentialSlot | null {
  const row: unknown = Array.isArray(data)
    ? data?.[0]
    : isPlainRecord(data)
      ? data
      : undefined;

  if (!isPlainRecord(row)) {
    return null;
  }

  const creds = row['credentials'];
  const slot: unknown = Array.isArray(creds)
    ? creds?.[0]
    : isPlainRecord(creds)
      ? creds
      : undefined;

  if (!isPlainRecord(slot)) {
    return null;
  }

  return slot as DbmsCredentialSlot;
}

function pickPrimaryOrSecondaryUsernamePassword(
  slot: DbmsCredentialSlot,
  primary: { usernameKey: keyof DbmsCredentialSlot; passwordKey: keyof DbmsCredentialSlot },
  secondary: { usernameKey: keyof DbmsCredentialSlot; passwordKey: keyof DbmsCredentialSlot },
): { username: string; password: string } | null {
  const pu = slot?.[primary.usernameKey];
  const pp = slot?.[primary.passwordKey];
  const su = slot?.[secondary.usernameKey];
  const sp = slot?.[secondary.passwordKey];
  const primaryOk =
    typeof pu === 'string' &&
    pu.length > 0 &&
    typeof pp === 'string' &&
    pp.length > 0;
  const secondaryOk =
    typeof su === 'string' &&
    su.length > 0 &&
    typeof sp === 'string' &&
    sp.length > 0;
  if (!primaryOk && !secondaryOk) {
    return null;
  }
  if (primaryOk) {
    return { username: pu as string, password: pp as string };
  }
  return { username: su as string, password: sp as string };
}

/**
 * Reads OTA login fields from a DBMS lookup response, preferring primary credentials over secondary.
 * Pass the inner list or row: HTTP body `data` (e.g. Axios `response.data.data`). Supports
 * `credentials` as a single object or as an array of credential objects.
 */
export function extractOtaCredentialsFromDbmsLookup(
  data: unknown,
  ota_provider: DbmsOtaProvider,
): DbmsExtractedOtaCredentials | null {
  const slot = getFirstDbmsCredentialSlot(data);
  if (!slot) {
    return null;
  }

  if (ota_provider === 'expedia') {
    const picked = pickPrimaryOrSecondaryUsernamePassword(
      slot,
      { usernameKey: 'expediaUsername', passwordKey: 'expediaPassword' },
      {
        usernameKey: 'expediaSecondaryUsername',
        passwordKey: 'expediaSecondaryPassword',
      },
    );
    if (!picked) {
      return null;
    }
    return {
      expediaUsername: picked.username,
      expediaPassword: picked.password,
    };
  }

  if (ota_provider === 'agoda') {
    const picked = pickPrimaryOrSecondaryUsernamePassword(
      slot,
      { usernameKey: 'agodaUsername', passwordKey: 'agodaPassword' },
      {
        usernameKey: 'agodaSecondaryUsername',
        passwordKey: 'agodaSecondaryPassword',
      },
    );
    if (!picked) {
      return null;
    }
    return {
      agodaUsername: picked.username,
      agodaPassword: picked.password,
    };
  }

  if (ota_provider === 'booking') {
    const picked = pickPrimaryOrSecondaryUsernamePassword(
      slot,
      { usernameKey: 'bookingUsername', passwordKey: 'bookingPassword' },
      {
        usernameKey: 'bookingSecondaryUsername',
        passwordKey: 'bookingSecondaryPassword',
      },
    );
    if (!picked) {
      return null;
    }
    return {
      bookingUsername: picked.username,
      bookingPassword: picked.password,
    };
  }

  return null;
}

export function buildDbmsLookupUrl(
  baseUrl: string,
  ota_provider: DbmsOtaProvider,
  ota_id: string | number,
): string {
  const trimmed = baseUrl?.trim?.() ?? '';
  const idPart = encodeURIComponent(String(ota_id));
  const keyPart = encodeURIComponent(ota_provider);
  const projectType = 'project_type=PARSER';
  if (!trimmed) {
    return `?${keyPart}=${idPart}&${projectType}`;
  }
  const joiner = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${joiner}${keyPart}=${idPart}&${projectType}`;
}

/**
 * Payload aligned with PUT /property-credentials/:id — null placeholders plus DBMS-derived OTA fields.
 */
export function buildPropertyCredentialsPayloadFromDbmsStep(
  property_id: string,
  step3: DbmsExtractedOtaCredentials,
): UpdatePropertyCredentialsDto {
  return {
    expediaUsername: null,
    expediaPassword: null,
    agodaUsername: null,
    agodaPassword: null,
    bookingUsername: null,
    bookingPassword: null,
    expediaEmailAssociated: null,
    propertyContactEmail: null,
    portfolioContactEmail: null,
    multiplePortfolioEmails: [],
    property_id,
    ...step3,
  } as UpdatePropertyCredentialsDto;
}

export function isDbmsOtaProvider(value: unknown): value is DbmsOtaProvider {
  return value === 'expedia' || value === 'agoda' || value === 'booking';
}

export function hasOtaIdForDbmsLookup(ota_id: unknown): boolean {
  if (ota_id === undefined || ota_id === null) {
    return false;
  }
  if (typeof ota_id === 'string') {
    return ota_id.trim().length > 0;
  }
  return true;
}
