/** Merchant identifier as returned in NovaPay docs (string or number). */
export type MerchantId = string | number;

export type JsonObject = Record<string, unknown>;

export type ProductLine = {
  description?: string;
  count?: string | number;
  price?: string | number;
};

/**
 * @see https://novapay.readme.io/reference/create-session
 */
export type CreateSessionRequest = {
  merchant_id: MerchantId;
  client_phone: string;
  client_first_name?: string;
  client_last_name?: string;
  client_patronymic?: string;
  client_email?: string;
  callback_url?: string;
  success_url?: string;
  fail_url?: string;
  success_redirect_timeout?: number;
  metadata?: JsonObject;
};

/**
 * Typical successful response for create session.
 * @see NovaPay API examples
 */
export type SessionCreateResponse = {
  id: string;
};

/**
 * Typical successful response for add payment.
 * @see NovaPay API examples
 */
export type SessionPaymentResponse = {
  url: string;
  id: string;
  session_id: string;
};

/**
 * @see https://novapay.readme.io/reference/add-payment
 */
export type AddPaymentRequest = {
  merchant_id: MerchantId;
  session_id: string;
  amount: number;
  external_id?: string;
  use_hold?: boolean;
  identifier?: string;
  products?: ProductLine[];
  delivery?: JsonObject;
};

export type SessionIdRequest = {
  merchant_id: MerchantId;
  session_id: string;
};

export type CompleteHoldOperation = {
  id: string;
  recipient_identifier?: string;
  amount?: number;
};

/**
 * @see https://novapay.readme.io/reference/complete-hold
 */
export type CompleteHoldRequest = {
  merchant_id: MerchantId;
  session_id: string;
  amount?: number;
  operations?: CompleteHoldOperation[];
};
