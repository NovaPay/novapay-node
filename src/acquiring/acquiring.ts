import { paths } from '../constants.js';
import { signedPost } from '../http.js';
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
  constructor(private readonly opts: AcquiringClientOptions) {}

  createSession(body: CreateSessionRequest): Promise<SessionCreateResponse> {
    return signedPost({
      ...this.opts,
      path: paths.acquiring.createSession,
      body,
    }) as Promise<SessionCreateResponse>;
  }

  addPayment(body: AddPaymentRequest): Promise<SessionPaymentResponse> {
    return signedPost({
      ...this.opts,
      path: paths.acquiring.addPayment,
      body,
    }) as Promise<SessionPaymentResponse>;
  }

  /**
   * Refunds a paid session — works on a direct charge and on a captured hold alike.
   * Moves the session to `voided` / `REFUNDED`.
   *
   * Responds with a literal `null` body; call {@link getStatus} to see the outcome.
   * Throws `NovaPayApiError` (`SessionAlreadyRefundedError`) when the session was never paid.
   */
  voidSession(body: SessionIdRequest): Promise<null> {
    return signedPost({
      ...this.opts,
      path: paths.acquiring.voidSession,
      body,
    }) as Promise<null>;
  }

  /**
   * Captures a session held via `use_hold`, moving it from `holded` to `paid`.
   *
   * Responds with a literal `null` body; call {@link getStatus} to see the outcome.
   * Throws `NovaPayApiError` (`SessionNotFoundError`) when the hold does not exist or expired.
   */
  completeHold(body: CompleteHoldRequest): Promise<null> {
    return signedPost({
      ...this.opts,
      path: paths.acquiring.completeHold,
      body,
    }) as Promise<null>;
  }

  /** Expires an unpaid session. Responds with a literal `null` body. */
  expireSession(body: SessionIdRequest): Promise<null> {
    return signedPost({
      ...this.opts,
      path: paths.acquiring.expireSession,
      body,
    }) as Promise<null>;
  }

  getStatus(body: SessionIdRequest): Promise<SessionStatusResponse> {
    return signedPost({
      ...this.opts,
      path: paths.acquiring.getStatus,
      body,
    }) as Promise<SessionStatusResponse>;
  }
}
