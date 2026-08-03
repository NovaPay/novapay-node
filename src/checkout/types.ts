import type {
  AddPaymentRequest,
  CompleteHoldRequest,
  JsonObject,
  SessionCreateResponse,
  SessionIdRequest,
  SessionPaymentResponse,
  SessionStatusResponse,
} from '../acquiring/types.js';

export type {
  CompleteHoldRequest,
  SessionCreateResponse,
  SessionPaymentResponse,
  SessionStatusResponse,
};

/**
 * Response for checkout add payment.
 * Verified against `POST /v1/checkout/payment` on the QE environment.
 *
 * Unlike acquiring's {@link SessionPaymentResponse} this response carries **no `id`** —
 * the transaction id only shows up later in get-status `operations[].transaction_id`.
 */
export type CheckoutPaymentResponse = {
  /** Checkout page to redirect the customer to. */
  url: string;
  session_id: string;
};

/**
 * @see https://novapay.readme.io/reference/create-checkout-session
 */
export type CreateCheckoutSessionRequest = {
  callback_url: string;
  success_url?: string;
  fail_url?: string;
  client_phone?: string;
  create_express_waybill?: boolean;
  delivery?: JsonObject;
  /** Undocumented in NovaPay's reference, but accepted and echoed back in get-status. */
  metadata?: JsonObject;
};

/**
 * Identical to acquiring add-payment. Split back into a distinct shape if NovaPay's
 * checkout add-payment ever diverges.
 * @see https://novapay.readme.io/reference/add-checkout-payment
 */
export type AddCheckoutPaymentRequest = AddPaymentRequest;

export type CheckoutSessionRequest = SessionIdRequest;
