import { AcquiringClient } from './acquiring/acquiring.js';
import { CheckoutClient } from './checkout/checkout.js';
import { getExternalApiBaseUrl, NovaPayEnvironment } from './environment.js';
import { NovaPayConfigError } from './errors.js';
import { parsePublicKey, verifyWithKey } from './sign.js';

export type CreateNovaPayClientOptions = {
  /**
   * Merchant RSA private key PEM used to sign outgoing API requests.
   * Parsed once here — an invalid PEM throws from `createClient`, not from the first charge.
   */
  privateKeyPem: string;
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
};

export type NovaPayClient = {
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
};

export function createClient(options: CreateNovaPayClientOptions): NovaPayClient {
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
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs,
  };
  return {
    acquiring: new AcquiringClient({ ...shared, baseUrl: acquiringBaseUrl }),
    checkout: new CheckoutClient({ ...shared, baseUrl: checkoutBaseUrl }),
    verifyPostback: (rawBody, xSign) => {
      if (!novapayPublicKey) {
        throw new NovaPayConfigError(
          'verifyPostback requires novapayPublicKeyPem in createClient options (NovaPay public key from authentication docs).',
        );
      }
      return verifyWithKey(rawBody, xSign, novapayPublicKey);
    },
  };
}
