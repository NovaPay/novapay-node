import { paths } from '../constants.js';
import { signedPost } from '../http.js';
import type {
  AddPaymentRequest,
  CompleteHoldRequest,
  CreateSessionRequest,
  SessionCreateResponse,
  SessionIdRequest,
  SessionPaymentResponse,
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

  voidSession(body: SessionIdRequest): Promise<unknown> {
    return signedPost({ ...this.opts, path: paths.acquiring.voidSession, body });
  }

  completeHold(body: CompleteHoldRequest): Promise<unknown> {
    return signedPost({ ...this.opts, path: paths.acquiring.completeHold, body });
  }

  expireSession(body: SessionIdRequest): Promise<unknown> {
    return signedPost({ ...this.opts, path: paths.acquiring.expireSession, body });
  }

  getStatus(body: SessionIdRequest): Promise<unknown> {
    return signedPost({ ...this.opts, path: paths.acquiring.getStatus, body });
  }
}
