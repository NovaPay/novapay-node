import { paths } from '../constants.js';
import { signedPost } from '../http.js';
import type {
  AddCheckoutPaymentRequest,
  CheckoutSessionRequest,
  CompleteHoldRequest,
  CreateCheckoutSessionRequest,
  SessionCreateResponse,
  SessionPaymentResponse,
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
      body,
    }) as Promise<SessionCreateResponse>;
  }

  addPayment(body: AddCheckoutPaymentRequest): Promise<SessionPaymentResponse> {
    return signedPost({
      ...this.opts,
      path: paths.checkout.addPayment,
      body,
    }) as Promise<SessionPaymentResponse>;
  }

  voidSession(body: CheckoutSessionRequest): Promise<unknown> {
    return signedPost({ ...this.opts, path: paths.checkout.voidSession, body });
  }

  /**
   * Confirms a checkout hold. Uses `POST /v1/complete-hold` on the checkout base URL
   * (same path as acquiring, per NovaPay external API layout).
   * @see https://novapay.readme.io/reference/complete-checkout-hold
   */
  completeHold(body: CompleteHoldRequest): Promise<unknown> {
    return signedPost({ ...this.opts, path: paths.checkout.completeHold, body });
  }

  getStatus(body: CheckoutSessionRequest): Promise<unknown> {
    return signedPost({ ...this.opts, path: paths.checkout.getStatus, body });
  }

  expireSession(body: CheckoutSessionRequest): Promise<unknown> {
    return signedPost({ ...this.opts, path: paths.checkout.expireSession, body });
  }
}
