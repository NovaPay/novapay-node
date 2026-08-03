import type { AcquiringPostbackV1, AcquiringPostbackV2 } from './types-acquiring.js';

export type CheckoutPostbackDelivery = {
  recipient_city?: string;
  recipient_city_description?: string;
  recipient_warehouse?: string;
  recipient_warehouse_description?: string;
  recipient_street?: string;
  recipient_street_description?: string;
  recipient_building?: string;
  recipient_flat?: string;
  /** Human-readable address assembled by NovaPay; `null` when parts are missing. */
  recipient_address?: string | null;
  express_waybills?: string[];
  ew_fail_reason?: string[];
  recipient_phone?: string;
  recipient_email?: string;
  recipient_last_name?: string;
  recipient_first_name?: string;
  recipient_patronymic?: string;
};

type CheckoutPostbackFields = {
  delivery?: CheckoutPostbackDelivery;
  /** Decimal string. */
  delivery_amount?: string;
  delivery_status_code?: string | number;
  delivery_status_text?: string;
};

/** Checkout postback, merchant postback version 1. */
export type CheckoutPostbackV1 = AcquiringPostbackV1 & CheckoutPostbackFields;

/**
 * Checkout postback, merchant postback version 2.
 * @see https://novapay.readme.io/reference/v3-checkout-postbacks-current-version
 */
export type CheckoutPostbackV2 = AcquiringPostbackV2 & CheckoutPostbackFields;
