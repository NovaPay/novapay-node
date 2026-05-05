import { PRODUCTION_BASE_URL, TEST_BASE_URL } from './constants.js';

/** NovaPay external API (acquiring + checkout) environment. */
export const NovaPayEnvironment = {
  Test: 'test',
  Production: 'production',
} as const;

export type NovaPayEnvironment = (typeof NovaPayEnvironment)[keyof typeof NovaPayEnvironment];

/**
 * Resolves the API host for Acquiring and Checkout (same base URL per environment).
 * @see https://novapay.readme.io/reference/acquiring-requests
 */
export function getExternalApiBaseUrl(environment: NovaPayEnvironment): string {
  if (environment === NovaPayEnvironment.Production) {
    return PRODUCTION_BASE_URL;
  }
  return TEST_BASE_URL;
}
