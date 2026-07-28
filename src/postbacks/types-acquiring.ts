import type { SessionStatus } from '../acquiring/types.js';

/**
 * v3 acquiring postback (current as of 2025-10-01).
 * @see https://novapay.readme.io/reference/v3-acquiring-postback-current-version
 *
 * Open union: known values autocomplete, unrecognised ones still type-check.
 */
export type AcquiringPostbackPaytype =
  | 'card'
  | 'apple_pay'
  | 'google_pay'
  | 'wallet'
  | (string & {});

export type AcquiringPostbackProduct = {
  count?: number;
  price?: number;
  description?: string;
};

export type AcquiringPostbackPayment = {
  external_id?: string;
  amount?: number;
  products?: AcquiringPostbackProduct[];
};

export type AcquiringPostbackCardDetails = {
  pan?: string;
  card_bank?: string;
  card_country?: string;
  card_type?: string;
};

/**
 * Full payload shape may evolve; optional fields reflect documented v3 examples.
 */
export type AcquiringPostbackV3 = {
  id: string;
  /** Same lifecycle values as {@link SessionStatus} on get-status. */
  status?: SessionStatus;
  paytype?: AcquiringPostbackPaytype;
  terminal_name?: string;
  RRN?: string;
  APPROVAL?: string | number;
  created_at?: string;
  metadata?: Record<string, unknown>;
  client_first_name?: string;
  client_last_name?: string;
  client_patronymic?: string;
  client_phone?: string;
  client_email?: string;
  client_ip?: string;
  processing_result?: string;
  card_details?: AcquiringPostbackCardDetails;
  payments?: AcquiringPostbackPayment[];
};
