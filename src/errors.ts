/**
 * Business/processing failure — the request was well-formed but rejected.
 * Verified against QE: `SessionNotFoundError`, `SessionAlreadyRefundedError`, `NotFoundError`.
 */
export type NovaPayProcessingErrorBody = {
  /** Server-side correlation id — quote it in support tickets. */
  uuid: string;
  type: 'processing';
  /** Human-readable message, e.g. `"session already refunded"`. */
  error: string;
  description: string;
  /** Machine-readable code — branch on this, not on `error`. */
  code: string;
};

/** Request body failed schema validation. Verified against QE. */
export type NovaPayValidationErrorBody = {
  uuid: string;
  type: 'validation';
  errors: NovaPayFieldError[];
};

/** One field rejected by NovaPay's schema validation. */
export type NovaPayFieldError = {
  message: string;
  code: string;
  /** Offending field name, e.g. `"client_phone"`. */
  path: string;
};

/**
 * The two error bodies NovaPay returns with a 4xx, as they appear on the wire.
 * You rarely need these — {@link NovaPayProcessingError} and {@link NovaPayValidationError}
 * expose the same fields already narrowed.
 */
export type NovaPayErrorBody = NovaPayProcessingErrorBody | NovaPayValidationErrorBody;

/**
 * Base class for everything this SDK throws. Catch it to catch any NovaPay error
 * without listing the subclasses.
 *
 * Two things sit outside the tree, both because no merchant mistake produced them: an expired
 * `timeoutMs` or an aborted `signal` rejects with a `DOMException` (no request reached NovaPay),
 * and `client.parsePostback` lets `JSON.parse`'s `SyntaxError` through on a body that passed
 * signature verification (NovaPay itself sent something unparseable).
 */
export abstract class NovaPayError extends Error {}

/**
 * The SDK was used or configured wrongly — a malformed PEM, a missing option.
 * Never caused by a NovaPay response, and never worth retrying: fix the call site.
 */
export class NovaPayConfigError extends NovaPayError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NovaPayConfigError';
  }
}

/**
 * An incoming postback did not match its `x-sign-v2` signature — reject the request.
 *
 * Thrown by `client.parsePostback`; `client.verifyPostback` returns `false` instead.
 */
export class NovaPaySignatureError extends NovaPayError {
  constructor(message: string) {
    super(message);
    this.name = 'NovaPaySignatureError';
  }
}

type ApiErrorInit = {
  status: number;
  responseBody: string;
  responseJson?: unknown;
};

/**
 * NovaPay answered with a non-2xx status.
 *
 * Thrown as-is when the body is not one of the two documented shapes — a 5xx, an HTML
 * page from a gateway, an empty body. When the shape *is* documented you get
 * {@link NovaPayProcessingError} or {@link NovaPayValidationError}, both of which extend
 * this class, so `instanceof NovaPayApiError` catches all three.
 */
export class NovaPayApiError extends NovaPayError {
  readonly status: number;
  readonly responseBody: string;
  readonly responseJson: unknown;

  constructor(message: string, init: ApiErrorInit) {
    super(message);
    this.name = 'NovaPayApiError';
    this.status = init.status;
    this.responseBody = init.responseBody;
    this.responseJson = init.responseJson;
  }
}

/**
 * NovaPay rejected a well-formed request for a business reason.
 * Branch on {@link code}, never on {@link error} — the message text is not a contract.
 */
export class NovaPayProcessingError extends NovaPayApiError {
  /** Machine-readable code, e.g. `'SessionAlreadyRefundedError'`. */
  readonly code: string;
  /** Human-readable message, e.g. `'session already refunded'`. */
  readonly error: string;
  readonly description: string;
  /** Server-side correlation id — quote it in support tickets. */
  readonly uuid: string;

  constructor(init: ApiErrorInit, body: NovaPayProcessingErrorBody) {
    super(
      `NovaPay API HTTP ${init.status} ${body.code}: ${body.error || 'processing error'}`,
      init,
    );
    this.name = 'NovaPayProcessingError';
    this.code = body.code;
    this.error = body.error;
    this.description = body.description;
    this.uuid = body.uuid;
  }
}

/** The request body failed NovaPay's schema validation. Inspect {@link errors} for the fields. */
export class NovaPayValidationError extends NovaPayApiError {
  /** One entry per rejected field. */
  readonly errors: NovaPayFieldError[];
  /** Server-side correlation id — quote it in support tickets. */
  readonly uuid: string;

  constructor(init: ApiErrorInit, body: NovaPayValidationErrorBody) {
    super(`NovaPay API HTTP ${init.status} validation: ${describeFields(body.errors)}`, init);
    this.name = 'NovaPayValidationError';
    this.errors = body.errors;
    this.uuid = body.uuid;
  }

  /** Field names NovaPay rejected, e.g. `['client_phone']`. */
  get paths(): string[] {
    return this.errors.map((e) => e.path);
  }
}

function describeFields(errors: NovaPayFieldError[]): string {
  if (errors.length === 0) return 'no field details';
  const shown = errors
    .slice(0, 3)
    .map((e) => `${e.path} (${e.code})`)
    .join(', ');
  return errors.length > 3 ? `${shown} +${errors.length - 3} more` : shown;
}

/**
 * Picks the most specific error class the response body supports.
 *
 * A body only earns a subclass if the fields that subclass promises are actually there —
 * a truncated or mislabelled body falls back to {@link NovaPayApiError} rather than
 * handing the caller a `code` of `undefined`.
 *
 * @internal
 */
export function apiErrorFor(init: ApiErrorInit): NovaPayApiError {
  const body = init.responseJson;
  if (typeof body === 'object' && body !== null) {
    const probe = body as { type?: unknown; code?: unknown; errors?: unknown };
    if (probe.type === 'processing' && typeof probe.code === 'string') {
      return new NovaPayProcessingError(init, body as NovaPayProcessingErrorBody);
    }
    if (probe.type === 'validation' && Array.isArray(probe.errors)) {
      return new NovaPayValidationError(init, body as NovaPayValidationErrorBody);
    }
  }
  return new NovaPayApiError(`NovaPay API HTTP ${init.status}`, init);
}
