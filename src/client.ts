import { AcquiringClient } from './acquiring/acquiring.js';
import { CheckoutClient } from './checkout/checkout.js';
import { getExternalApiBaseUrl, NovaPayEnvironment } from './environment.js';
import { verifyPostbackSignature } from './sign.js';

export type CreateNovaPayClientOptions = {
  /** Merchant RSA private key PEM used to sign outgoing API requests. */
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
  /** @default 30_000 */
  timeoutMs?: number;
};

export type NovaPayClient = {
  acquiring: AcquiringClient;
  checkout: CheckoutClient;
  /**
   * Verifies `x-sign-v2` on a raw postback body using `novapayPublicKeyPem`
   * from {@link CreateNovaPayClientOptions}.
   */
  verifyPostback: (rawBody: string | Buffer, xSign: string) => boolean;
};

export function createClient(options: CreateNovaPayClientOptions): NovaPayClient {
  const env = options.environment ?? NovaPayEnvironment.Test;
  const resolvedBaseUrl = getExternalApiBaseUrl(env);
  const acquiringBaseUrl = options.acquiringBaseUrl ?? resolvedBaseUrl;
  const checkoutBaseUrl = options.checkoutBaseUrl ?? resolvedBaseUrl;
  const shared = {
    privateKeyPem: options.privateKeyPem,
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs,
  };
  return {
    acquiring: new AcquiringClient({ ...shared, baseUrl: acquiringBaseUrl }),
    checkout: new CheckoutClient({ ...shared, baseUrl: checkoutBaseUrl }),
    verifyPostback: (rawBody, xSign) => {
      if (!options.novapayPublicKeyPem) {
        throw new Error(
          'verifyPostback requires novapayPublicKeyPem in createClient options (NovaPay public key from authentication docs).',
        );
      }
      return verifyPostbackSignature(rawBody, xSign, options.novapayPublicKeyPem);
    },
  };
}
