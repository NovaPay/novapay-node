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
 * Response for create session (acquiring and checkout).
 * Verified against `POST /v1/session` on the QE environment.
 */
export type SessionCreateResponse = {
  /** Session id — pass as `session_id` to every other endpoint. */
  id: string;
  metadata: JsonObject | null;
};

/**
 * Response for acquiring add payment.
 * Verified against `POST /v1/payment` on the QE environment.
 *
 * Note: checkout's add payment omits `id` — see {@link import('../checkout/types.js').CheckoutPaymentResponse}.
 */
export type SessionPaymentResponse = {
  /** Payment page to redirect the customer to. */
  url: string;
  /** Transaction id (`operations[].transaction_id` in get-status). */
  id: string;
  session_id: string;
};

/**
 * Session lifecycle status. All values below were observed on QE; NovaPay can add
 * more, so any other string stays assignable.
 *
 * `created` → `holded` → `paid` → `voided` is the hold flow;
 * `created` → `paid` → `voided` is the direct-charge flow.
 */
export type SessionStatus =
  | 'created' // acquiring session opened, not paid
  | 'precreated' // checkout session opened, not paid
  | 'holded' // funds authorized by `use_hold`, awaiting completeHold
  | 'paid' // funds captured
  | 'voided' // refunded via voidSession
  | 'expired' // expireSession, or the session window elapsed
  | (string & {});

/** Acquirer verdict on the card transaction. Observed on QE. */
export type TransactionStatus = 'APPROVED' | 'REFUNDED' | (string & {});

/** One transaction inside a session, as returned by get-status. */
export type SessionStatusOperation = {
  transaction_id: string | null;
  /** Echoes `external_id` from add-payment. */
  external_id: string | null;
  /** Decimal string, e.g. `"10.00"`. */
  amount: string;
  /**
   * Decimal string. Stayed `null` on QE even after a successful void —
   * use `status` / `transaction_status` to detect a refund, not this field.
   */
  refunded_amount: string | null;
  /** Mirrors the session `status`. */
  status: SessionStatus;
};

/**
 * Response for get-status (acquiring and checkout share one endpoint).
 * Verified against `POST /v1/get-status` on QE, both before and after a real card payment.
 *
 * The card fields (`pan`, `paytype`, `approval_code`, `card_type`, `transaction_status`)
 * are `null` until the customer actually pays. get-status is the only reliable way to
 * observe the result of completeHold / voidSession, which return no data of their own.
 */
export type SessionStatusResponse = {
  id: string;
  /**
   * Merchant metadata from create-session, plus fields NovaPay adds once the customer
   * reaches the payment page (observed: `client_fingerprint`, `preprocess_client_id`).
   * `null` on a session that was never opened by a customer.
   */
  metadata: JsonObject | null;
  status: SessionStatus;
  /** ISO 8601 with offset, e.g. `"2026-07-27T19:52:48.900+00:00"`. */
  created_at: string;
  client_phone: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  client_patronymic: string | null;
  /** Masked card number, e.g. `"424242xxxxxx4242"`. `null` before payment. */
  pan: string | null;
  /** Retrieval reference number. Stayed `null` on QE even after a successful payment. */
  rrn: string | null;
  /** Observed: `"card"`. Empty string (not `null`) before payment. */
  paytype: string;
  /** Acquirer approval code, e.g. `"1785182032.057"`. `null` before payment. */
  approval_code: string | null;
  /** Observed: `"VISA"`. `null` before payment. */
  card_type: string | null;
  transaction_status: TransactionStatus | null;
  /** Decimal string, e.g. `"1.00"`. */
  amount: string;
  /** `null` before payment, empty string after a clean one. */
  processing_result: string | null;
  operations: SessionStatusOperation[];
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
