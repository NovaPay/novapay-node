import type {
  AddPaymentRequest,
  CompleteHoldRequest,
  JsonObject,
  MerchantId,
  SessionCreateResponse,
  SessionIdRequest,
  SessionPaymentResponse,
} from '../acquiring/types.js';

export type { CompleteHoldRequest, SessionCreateResponse, SessionPaymentResponse };

/**
 * @see https://novapay.readme.io/reference/create-checkout-session
 */
export type CreateCheckoutSessionRequest = {
  merchant_id: MerchantId;
  callback_url: string;
  success_url?: string;
  fail_url?: string;
  client_phone?: string;
  create_express_waybill?: boolean;
  delivery?: JsonObject;
};

/**
 * Identical to acquiring add-payment. Split back into a distinct shape if NovaPay's
 * checkout add-payment ever diverges.
 * @see https://novapay.readme.io/reference/add-checkout-payment
 */
export type AddCheckoutPaymentRequest = AddPaymentRequest;

export type CheckoutSessionRequest = SessionIdRequest;
