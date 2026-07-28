import { paths, withSdkMetadata } from '../constants.js';
import { signedPost } from '../http.js';
import type {
  AddCheckoutPaymentRequest,
  CheckoutPaymentResponse,
  CheckoutSessionRequest,
  CompleteHoldRequest,
  CreateCheckoutSessionRequest,
  SessionCreateResponse,
  SessionStatusResponse,
} from './types.js';

export type CheckoutClientOptions = {
  baseUrl: string;
  privateKeyPem: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

export class CheckoutClient {
  constructor(private readonly opts: CheckoutClientOptions) {}

  createSession(body: CreateCheckoutSessionRequest): Promise<SessionCreateResponse> {
    return signedPost({
      ...this.opts,
      path: paths.checkout.createSession,
      body: withSdkMetadata(body),
    }) as Promise<SessionCreateResponse>;
  }

  addPayment(body: AddCheckoutPaymentRequest): Promise<CheckoutPaymentResponse> {
    return signedPost({
      ...this.opts,
      path: paths.checkout.addPayment,
      body,
    }) as Promise<CheckoutPaymentResponse>;
  }

  /**
   * Refunds a paid checkout session.
   *
   * Responds with a literal `null` body; call {@link getStatus} to see the outcome.
   */
  voidSession(body: CheckoutSessionRequest): Promise<null> {
    return signedPost({
      ...this.opts,
      path: paths.checkout.voidSession,
      body,
    }) as Promise<null>;
  }

  /**
   * Confirms a checkout hold. Uses `POST /v1/complete-hold` on the checkout base URL
   * (same path as acquiring, per NovaPay external API layout).
   * @see https://novapay.readme.io/reference/complete-checkout-hold
   *
   * Responds with a literal `null` body; call {@link getStatus} to see the outcome.
   */
  completeHold(body: CompleteHoldRequest): Promise<null> {
    return signedPost({
      ...this.opts,
      path: paths.checkout.completeHold,
      body,
    }) as Promise<null>;
  }

  getStatus(body: CheckoutSessionRequest): Promise<SessionStatusResponse> {
    return signedPost({
      ...this.opts,
      path: paths.checkout.getStatus,
      body,
    }) as Promise<SessionStatusResponse>;
  }

  /** Expires an unpaid session. Responds with a literal `null` body. */
  expireSession(body: CheckoutSessionRequest): Promise<null> {
    return signedPost({
      ...this.opts,
      path: paths.checkout.expireSession,
      body,
    }) as Promise<null>;
  }
}
