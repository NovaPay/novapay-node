import { HEADER_X_SIGN } from './constants.js';
import { NovaPayApiError } from './errors.js';
import { signRequestBody } from './sign.js';
import { joinBaseAndPath } from './url.js';

export type SignedPostOptions = {
  baseUrl: string;
  path: string;
  body: unknown;
  privateKeyPem: string;
  fetchFn?: typeof fetch;
  /** @default 30_000 */
  timeoutMs?: number;
};

async function readBody(res: Response): Promise<{ text: string; json: unknown | undefined }> {
  const text = await res.text();
  if (!text) return { text: '', json: undefined };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: undefined };
  }
}

/**
 * POST JSON with `x-sign` over the exact serialized body (RSA-SHA256, Base64).
 */
export async function signedPost(options: SignedPostOptions): Promise<unknown> {
  const bodyStr = JSON.stringify(options.body);
  const xSign = signRequestBody(bodyStr, options.privateKeyPem);
  const url = joinBaseAndPath(options.baseUrl, options.path);
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [HEADER_X_SIGN]: xSign,
      },
      body: bodyStr,
      signal: ctrl.signal,
    });
    const { text, json } = await readBody(res);
    if (!res.ok) {
      throw new NovaPayApiError(`NovaPay API HTTP ${res.status}`, {
        status: res.status,
        responseBody: text,
        responseJson: json,
      });
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}
