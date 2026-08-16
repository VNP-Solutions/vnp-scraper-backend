export const OTA_POST_PRE_CHARGING_ASYNC_ROW_THRESHOLD = 1000;

export const OTA_POST_PRE_CHARGING_EXPORT_HEADER: string[] = [
  'Account Type',
  'OTA ID',
  'Portfolio',
  'Subportfolio',
  'Hotel Name',
  'ReservationID',
  'Currency',
  'Amount to charge',
  'Card Number',
  'Expire',
  'Card CVV',
  'OTA Billing Name',
  'Address',
  'City',
  'State',
  'Zip Code',
  'OTA Name',
  'VNP Work ID (Leave Blank)',
  'Charge Status (Leave Blank)',
];

export const OTA_POST_PRE_CHARGING_ACCOUNT_TYPE = 'property';

export const OTA_POST_PRE_CHARGING_REQUIRED_IMPORT_COLUMNS = [
  'OTA',
  'OTA ID',
  'Portfolio',
  'Property Name',
  'Reservation ID',
  'Currency',
  'Amount to Charge',
  'Card Number',
  'Expiry date',
  'CVV',
] as const;

export type OtaPostPreChargingProvider = 'Expedia' | 'Booking' | 'Agoda';

export const OTA_POST_PRE_CHARGING_BILLING_INFO: Record<
  OtaPostPreChargingProvider,
  {
    billingName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  }
> = {
  Expedia: {
    billingName: 'Expedia Group',
    address: '1111 Expedia Group Way W',
    city: 'Seattle',
    state: 'WA',
    zipCode: '98119',
  },
  Booking: {
    billingName: 'Booking.com B.V. (Agent)',
    address: '350 5th Avenue, 6th Floor',
    city: 'New York',
    state: 'NY',
    zipCode: '10118-6617',
  },
  Agoda: {
    billingName: 'Agoda Company Pte Ltd.',
    address: '155 E. Boardwalk #490',
    city: 'Fort Collins',
    state: 'CO',
    zipCode: '80525',
  },
};
