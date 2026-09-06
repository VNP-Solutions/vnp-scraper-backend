/**
 * Portfolios, sub-portfolios and properties are owned by DBMS. They reach the
 * scraper only through the `sync-*` endpoints, so every other flow (Excel
 * imports, job/retrieval uploads, manual CRUD) must fail with one of these
 * messages instead of creating the record itself.
 */
export const DBMS_SYNC_ONLY_MESSAGE =
  'This portfolio/property is not found in our system, please upload/update those in DBMS and then come back later';

export const portfolioNotSyncedMessage = (name: string): string =>
  `Portfolio '${name}' is not found in our system, please upload/update those in DBMS and then come back later`;

export const subPortfolioNotSyncedMessage = (
  name: string,
  portfolioName?: string,
): string =>
  `Sub-portfolio '${name}'${
    portfolioName ? ` under portfolio '${portfolioName}'` : ''
  } is not found in our system, please upload/update those in DBMS and then come back later`;

export const propertyNotSyncedMessage = (nameOrId: string): string =>
  `Property '${nameOrId}' is not found in our system, please upload/update those in DBMS and then come back later`;

export const creationDisabledMessage = (entity: string): string =>
  `${entity} can no longer be created here. Please create it in DBMS and it will be synced automatically.`;
