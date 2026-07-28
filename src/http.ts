import type { KeyObject } from 'node:crypto';
import { HEADER_X_SIGN, SDK_RUNTIME, SDK_VERSION } from './constants.js';
import { apiErrorFor } from './errors.js';
import { parsePrivateKey, signWithKey } from './sign.js';
import { joinBaseAndPath } from './url.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/** Per-call overrides, accepted as the second argument of every client method. */
export type RequestOptions = {
  /**
   * Caller cancellation — combined with the timeout, so whichever fires first aborts.
   * Pass your server's request signal to drop the outgoing call when the client hangs up.
   */
  signal?: AbortSignal;
  /** Overrides the client's `timeoutMs` for this call only. */
  timeoutMs?: number;
};

export type SignedPostOptions = RequestOptions & {
  baseUrl: string;
  path: string;
  body: unknown;
  privateKeyPem: string;
  fetchFn?: typeof fetch;
};

/** Same as {@link SignedPostOptions} but with the key already parsed. @internal */
export type PostOptions = RequestOptions & {
  baseUrl: string;
  path: string;
  body: unknown;
  privateKey: KeyObject;
  fetchFn?: typeof fetch;
};

async function readBody(res: Response): Promise<{ text: string; json: unknown }> {
  const text = await res.text();
  if (!text) return { text: '', json: null };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: null };
  }
}

/**
 * POST JSON with `x-sign` over the exact serialized body (RSA-SHA256, Base64).
 * @internal
 */
export async function post(options: PostOptions): Promise<unknown> {
  const bodyStr = JSON.stringify(options.body);
  const xSign = signWithKey(bodyStr, options.privateKey);
  const url = joinBaseAndPath(options.baseUrl, options.path);
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': `novapay-node/${SDK_VERSION} ${SDK_RUNTIME}`,
      [HEADER_X_SIGN]: xSign,
    },
    body: bodyStr,
    signal,
  });
  const { text, json } = await readBody(res);
  if (!res.ok) {
    throw apiErrorFor({ status: res.status, responseBody: text, responseJson: json });
  }
  return json;
}

/**
 * Escape hatch for endpoints this SDK does not wrap yet — signs and posts an arbitrary body.
 *
 * Parses the PEM on every call. Prefer a client from
 * {@link import('./client.js').createClient}, which parses the key once.
 */
export function signedPost(options: SignedPostOptions): Promise<unknown> {
  const { privateKeyPem, ...rest } = options;
  return post({ ...rest, privateKey: parsePrivateKey(privateKeyPem) });
}
