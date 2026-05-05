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
