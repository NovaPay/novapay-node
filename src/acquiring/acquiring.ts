import type { KeyObject } from 'node:crypto';
import { paths, withSdkMetadata } from '../constants.js';
import { post, type RequestOptions } from '../http.js';
import { parsePrivateKey } from '../sign.js';
import type {
  AddPaymentRequest,
  CompleteHoldRequest,
  CreateSessionRequest,
  SessionCreateResponse,
  SessionIdRequest,
  SessionPaymentResponse,
  SessionStatusResponse,
} from './types.js';

export type AcquiringClientOptions = {
  baseUrl: string;
  privateKeyPem: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

export class AcquiringClient {
  readonly #opts: AcquiringClientOptions;
  /** Parsed once — a bad PEM throws here, not on the first charge. */
  readonly #privateKey: KeyObject;

  constructor(opts: AcquiringClientOptions) {
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
    body: CreateSessionRequest,
    options?: RequestOptions,
  ): Promise<SessionCreateResponse> {
    return this.#post(
      paths.acquiring.createSession,
      withSdkMetadata(body),
      options,
    ) as Promise<SessionCreateResponse>;
  }

  addPayment(body: AddPaymentRequest, options?: RequestOptions): Promise<SessionPaymentResponse> {
    return this.#post(paths.acquiring.addPayment, body, options) as Promise<SessionPaymentResponse>;
  }

  /**
   * Refunds a paid session — works on a direct charge and on a captured hold alike.
   * Moves the session to `voided` / `REFUNDED`.
   *
   * Responds with a literal `null` body; call {@link getStatus} to see the outcome.
   * Throws `NovaPayApiError` (`SessionAlreadyRefundedError`) when the session was never paid.
   */
  voidSession(body: SessionIdRequest, options?: RequestOptions): Promise<null> {
    return this.#post(paths.acquiring.voidSession, body, options) as Promise<null>;
  }

  /**
   * Captures a session held via `use_hold`, moving it from `holded` to `paid`.
   *
   * Responds with a literal `null` body; call {@link getStatus} to see the outcome.
   * Throws `NovaPayApiError` (`SessionNotFoundError`) when the hold does not exist or expired.
   */
  completeHold(body: CompleteHoldRequest, options?: RequestOptions): Promise<null> {
    return this.#post(paths.acquiring.completeHold, body, options) as Promise<null>;
  }

  /** Expires an unpaid session. Responds with a literal `null` body. */
  expireSession(body: SessionIdRequest, options?: RequestOptions): Promise<null> {
    return this.#post(paths.acquiring.expireSession, body, options) as Promise<null>;
  }

  getStatus(body: SessionIdRequest, options?: RequestOptions): Promise<SessionStatusResponse> {
    return this.#post(paths.acquiring.getStatus, body, options) as Promise<SessionStatusResponse>;
  }
}
