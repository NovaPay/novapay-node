import { AcquiringClient } from './acquiring/acquiring.js';
import { CheckoutClient } from './checkout/checkout.js';
import { getExternalApiBaseUrl, NovaPayEnvironment } from './environment.js';
import { NovaPayConfigError, NovaPaySignatureError } from './errors.js';
import type {
  AcquiringPostbackV1,
  AcquiringPostbackV2,
  PostbackVersion,
} from './postbacks/types-acquiring.js';
import { parsePublicKey, verifyWithKey } from './sign.js';

/** Default `parsePostback` payload type for each {@link PostbackVersion}. */
export type AcquiringPostbackByVersion = {
  v1: AcquiringPostbackV1;
  v2: AcquiringPostbackV2;
};

export type CreateNovaPayClientOptions<V extends PostbackVersion = 'v1'> = {
  /**
   * Merchant RSA private key PEM used to sign outgoing API requests.
   * Parsed once here — an invalid PEM throws from `createClient`, not from the first charge.
   */
  privateKeyPem: string;
  /**
   * Your NovaPay merchant id. Sent as `merchant_id` in every request body,
   * so individual calls don't repeat it.
   */
  merchantId: string;
  /**
   * NovaPay RSA **public** key PEM used to verify incoming postbacks.
   * If omitted, `client.verifyPostback` will throw.
   */
  novapayPublicKeyPem?: string;
  /**
   * API environment (test vs production). Both acquiring and checkout use the same host for a given environment.
   * @default {@link NovaPayEnvironment.Test}
   */
  environment?: NovaPayEnvironment;
  /**
   * Optional override for the acquiring API base URL (staging, mocks).
   * When set, takes precedence over the URL implied by `environment`.
   */
  acquiringBaseUrl?: string;
  /**
   * Optional override for the checkout API base URL.
   * When set, takes precedence over the URL implied by `environment`.
   */
  checkoutBaseUrl?: string;
  fetchFn?: typeof fetch;
  /** Default per-request timeout; override per call with `RequestOptions`. @default 30_000 */
  timeoutMs?: number;
  /**
   * Merchant `postback_version` setting at NovaPay — decides the payload shape NovaPay sends
   * and therefore the default type `parsePostback` returns. Typing only, no runtime effect.
   * @default PostbackVersion.v1
   */
  postbackVersion?: V;
};

export type NovaPayClient<V extends PostbackVersion = 'v1'> = {
  acquiring: AcquiringClient;
  checkout: CheckoutClient;
  /**
   * Verifies `x-sign-v2` on a raw postback body using `novapayPublicKeyPem`
   * from {@link CreateNovaPayClientOptions}.
   *
   * `rawBody` must be the untouched request bytes (a `Buffer` from your body parser is fine) —
   * re-serializing the parsed body will not match.
   */
  verifyPostback: (rawBody: string | Uint8Array, xSign: string) => boolean;
  /**
   * Verifies the signature and then decodes the postback in one step — the order that keeps you
   * from accidentally verifying an already re-serialized body.
   *
   * `rawBody` must be the untouched request bytes (a `Buffer` from your body parser is fine).
   * The default payload type follows `postbackVersion` from {@link CreateNovaPayClientOptions};
   * pass {@link import('./postbacks/types-checkout.js').CheckoutPostbackV1} /
   * {@link import('./postbacks/types-checkout.js').CheckoutPostbackV2} as the type argument
   * for a checkout postback.
   *
   * @throws NovaPaySignatureError when the signature does not match the raw request body
   * @throws NovaPayConfigError when the client was created without `novapayPublicKeyPem`
   * @throws SyntaxError when a body that *did* pass verification is not JSON — NovaPay itself
   *                     sent something unparseable, so this is not yours to handle: let it 500.
   */
  parsePostback: <T = AcquiringPostbackByVersion[V]>(
    rawBody: string | Uint8Array,
    xSign: string,
  ) => T;
};

export function createClient<V extends PostbackVersion = 'v1'>(
  options: CreateNovaPayClientOptions<V>,
): NovaPayClient<V> {
  const env = options.environment ?? NovaPayEnvironment.Test;
  const resolvedBaseUrl = getExternalApiBaseUrl(env);
  const acquiringBaseUrl = options.acquiringBaseUrl ?? resolvedBaseUrl;
  const checkoutBaseUrl = options.checkoutBaseUrl ?? resolvedBaseUrl;
  // Parsed up front so a malformed key fails at startup rather than mid-payment.
  const novapayPublicKey = options.novapayPublicKeyPem
    ? parsePublicKey(options.novapayPublicKeyPem)
    : undefined;
  const shared = {
    privateKeyPem: options.privateKeyPem,
    merchantId: options.merchantId,
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs,
  };
  const verifyPostback = (rawBody: string | Uint8Array, xSign: string): boolean => {
    if (!novapayPublicKey) {
      throw new NovaPayConfigError(
        'verifyPostback requires novapayPublicKeyPem in createClient options (NovaPay public key from authentication docs).',
      );
    }
    return verifyWithKey(rawBody, xSign, novapayPublicKey);
  };

  return {
    acquiring: new AcquiringClient({ ...shared, baseUrl: acquiringBaseUrl }),
    checkout: new CheckoutClient({ ...shared, baseUrl: checkoutBaseUrl }),
    verifyPostback,
    parsePostback: <T = AcquiringPostbackByVersion[V]>(
      rawBody: string | Uint8Array,
      xSign: string,
    ): T => {
      if (!verifyPostback(rawBody, xSign)) {
        throw new NovaPaySignatureError('Postback signature does not match the raw request body.');
      }
      // Past the signature check the bytes are provably NovaPay's, so there is no shape to
      // defend against — only `JSON.parse`'s own SyntaxError, which callers should not swallow.
      return JSON.parse(
        typeof rawBody === 'string' ? rawBody : new TextDecoder().decode(rawBody),
      ) as T;
    },
  };
}
