import type { AcquiringPostbackV3 } from './types-acquiring.js';

export type CheckoutPostbackDelivery = {
  recipient_city?: string;
  recipient_city_description?: string;
  recipient_warehouse?: string;
  recipient_warehouse_description?: string;
  recipient_address?: string;
  express_waybills?: string[];
  ew_fail_reason?: string[];
  recipient_phone?: string;
  recipient_last_name?: string;
  recipient_first_name?: string;
  recipient_patronymic?: string;
};

/**
 * v3 checkout postback (current as of 2025-10-01).
 * @see https://novapay.readme.io/reference/v3-checkout-postbacks-current-version
 */
export type CheckoutPostbackV3 = AcquiringPostbackV3 & {
  delivery?: CheckoutPostbackDelivery;
};
