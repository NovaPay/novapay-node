import type { SessionStatus } from '../acquiring/types.js';

/**
 * Merchant postback format version — a per-merchant NovaPay setting (`postback_version`).
 * NovaPay sends `v1` unless support has switched the merchant to `v2`.
 *
 * Pass it to `createClient` so `parsePostback` defaults to the matching payload type;
 * it changes typing only, the wire format is decided by NovaPay's merchant settings.
 */
export const PostbackVersion = {
  /** One POST per payment: `external_id`, `amount` and `products` on the top level. */
  v1: 'v1',
  /** One POST per session: payments grouped under `payments[]`. */
  v2: 'v2',
} as const;
export type PostbackVersion = (typeof PostbackVersion)[keyof typeof PostbackVersion];

/**
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
  /** Decimal string like get-status amounts; documented examples show a number. */
  amount?: number | string;
  products?: AcquiringPostbackProduct[];
};

export type AcquiringPostbackCardDetails = {
  pan?: string;
  card_bank?: string | null;
  card_country?: string | null;
  card_type?: string | null;
  /** Present only for merchants with the cards-promo option. */
  promo_card?: boolean;
};

/**
 * Fields common to both postback versions.
 * Full payload shape may evolve; optional fields reflect documented examples.
 */
export type AcquiringPostbackBase = {
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
};

/**
 * Postback version 1 — the default for merchants without an explicit `postback_version`.
 * NovaPay sends one POST per payment, with that payment's fields on the top level.
 */
export type AcquiringPostbackV1 = AcquiringPostbackBase & {
  external_id?: string;
  amount?: number;
  products?: AcquiringPostbackProduct[];
};

/**
 * Postback version 2 — one POST per session, payments grouped under `payments[]`.
 * This is what the readme.io "v3 acquiring postback" page documents.
 * @see https://novapay.readme.io/reference/v3-acquiring-postback-current-version
 */
export type AcquiringPostbackV2 = AcquiringPostbackBase & {
  payments?: AcquiringPostbackPayment[];
};
