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
  errors: Array<{
    message: string;
    code: string;
    /** Offending field name, e.g. `"client_phone"`. */
    path: string;
  }>;
};

/**
 * The two error bodies NovaPay returns with a 4xx. Discriminate on `type`.
 * Cast `NovaPayApiError.responseJson` to this only after checking it is an object —
 * 5xx and gateway errors can return anything.
 */
export type NovaPayErrorBody = NovaPayProcessingErrorBody | NovaPayValidationErrorBody;

/** Thrown when NovaPay returns a non-2xx HTTP status. */
export class NovaPayApiError extends Error {
  readonly status: number;
  readonly responseBody: string;
  readonly responseJson: unknown;

  constructor(
    message: string,
    init: {
      status: number;
      responseBody: string;
      responseJson?: unknown;
    },
  ) {
    super(message);
    this.name = 'NovaPayApiError';
    this.status = init.status;
    this.responseBody = init.responseBody;
    this.responseJson = init.responseJson;
  }
}
