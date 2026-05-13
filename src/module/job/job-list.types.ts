import type { Job, Property, PropertyCredentials } from '@prisma/client';

/** Flattened `property_credentials` row, aligned with GET /properties (may be `{}`). */
export type JobsListPropertyCredentials = Partial<
  Pick<
    PropertyCredentials,
    | 'id'
    | 'property_id'
    | 'expediaUsername'
    | 'expediaPassword'
    | 'expediaEmailAssociated'
    | 'bookingUsername'
    | 'bookingPassword'
    | 'agodaUsername'
    | 'agodaPassword'
    | 'portfolioContactEmail'
    | 'propertyContactEmail'
    | 'multiplePortfolioEmails'
  >
>;

/** `property` embed on each job in GET /jobs list responses. */
export type JobsListPropertyEmbed = Pick<
  Property,
  'id' | 'name' | 'expedia_id' | 'booking_id' | 'agoda_id'
> & {
  credentials: JobsListPropertyCredentials;
};

export type JobListItem = Job & {
  property?: JobsListPropertyEmbed | null;
  log_link: string | null;
  failed_reason: string;
  screenshot_urls: unknown[];
};
