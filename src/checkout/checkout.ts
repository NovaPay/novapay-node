import type { KeyObject } from 'node:crypto';
import { paths, withSdkMetadata } from '../constants.js';
import { post, type RequestOptions } from '../http.js';
import { parsePrivateKey } from '../sign.js';
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
  readonly #opts: CheckoutClientOptions;
  /** Parsed once — a bad PEM throws here, not on the first charge. */
  readonly #privateKey: KeyObject;

  constructor(opts: CheckoutClientOptions) {
    this.#opts = opts;
    this.#privateKey = parsePrivateKey(opts.privateKeyPem);
  }

  #post(path: string, body: unknown, options?: RequestOptions): Promise<unknown> {
    return post({
      baseUrl: this.#opts.baseUrl,
      path,
      body,
      privateKey: this.#privateKey,
      fetchFn: this.#opts.fetchFn,
      timeoutMs: options?.timeoutMs ?? this.#opts.timeoutMs,
      signal: options?.signal,
    });
  }

  createSession(
    body: CreateCheckoutSessionRequest,
    options?: RequestOptions,
  ): Promise<SessionCreateResponse> {
    return this.#post(
      paths.checkout.createSession,
      withSdkMetadata(body),
      options,
    ) as Promise<SessionCreateResponse>;
  }

  addPayment(
    body: AddCheckoutPaymentRequest,
    options?: RequestOptions,
  ): Promise<CheckoutPaymentResponse> {
    return this.#post(paths.checkout.addPayment, body, options) as Promise<CheckoutPaymentResponse>;
  }

  /**
   * Refunds a paid checkout session.
   *
   * Responds with a literal `null` body; call {@link getStatus} to see the outcome.
   */
  voidSession(body: CheckoutSessionRequest, options?: RequestOptions): Promise<null> {
    return this.#post(paths.checkout.voidSession, body, options) as Promise<null>;
  }

  /**
   * Confirms a checkout hold. Uses `POST /v1/complete-hold` on the checkout base URL
   * (same path as acquiring, per NovaPay external API layout).
   * @see https://novapay.readme.io/reference/complete-checkout-hold
   *
   * Responds with a literal `null` body; call {@link getStatus} to see the outcome.
   */
  completeHold(body: CompleteHoldRequest, options?: RequestOptions): Promise<null> {
    return this.#post(paths.checkout.completeHold, body, options) as Promise<null>;
  }

  getStatus(
    body: CheckoutSessionRequest,
    options?: RequestOptions,
  ): Promise<SessionStatusResponse> {
    return this.#post(paths.checkout.getStatus, body, options) as Promise<SessionStatusResponse>;
  }

  /** Expires an unpaid session. Responds with a literal `null` body. */
  expireSession(body: CheckoutSessionRequest, options?: RequestOptions): Promise<null> {
    return this.#post(paths.checkout.expireSession, body, options) as Promise<null>;
  }
}
