import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { PRODUCTION_BASE_URL, TEST_BASE_URL } from '../src/constants.js';
import { getExternalApiBaseUrl, NovaPayEnvironment } from '../src/environment.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('getExternalApiBaseUrl', () => {
  it('maps test and production', () => {
    expect(getExternalApiBaseUrl(NovaPayEnvironment.Test)).toBe(TEST_BASE_URL);
    expect(getExternalApiBaseUrl(NovaPayEnvironment.Production)).toBe(PRODUCTION_BASE_URL);
  });
});

describe('createClient environment', () => {
  it('uses production host when environment is Production', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = createClient({
      privateKeyPem: privateKey,
      environment: NovaPayEnvironment.Production,
      fetchFn: fetchFn as typeof fetch,
    });
    await client.acquiring.getStatus({ merchant_id: '2', session_id: 'x' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = String((fetchFn.mock.calls[0] as [string] | undefined)?.[0] ?? '');
    expect(url.startsWith(PRODUCTION_BASE_URL)).toBe(true);
  });

  it('uses override URL when acquiringBaseUrl is set', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = createClient({
      privateKeyPem: privateKey,
      environment: NovaPayEnvironment.Test,
      acquiringBaseUrl: 'https://custom-acquiring.example',
      fetchFn: fetchFn as typeof fetch,
    });
    await client.acquiring.getStatus({ merchant_id: '2', session_id: 'x' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = String((fetchFn.mock.calls[0] as [string] | undefined)?.[0] ?? '');
    expect(url.startsWith('https://custom-acquiring.example')).toBe(true);
  });

  it('uses override URL when checkoutBaseUrl is set', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = createClient({
      privateKeyPem: privateKey,
      environment: NovaPayEnvironment.Test,
      checkoutBaseUrl: 'https://custom-checkout.example',
      fetchFn: fetchFn as typeof fetch,
    });
    await client.checkout.getStatus({ merchant_id: '2', session_id: 'x' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = String((fetchFn.mock.calls[0] as [string] | undefined)?.[0] ?? '');
    expect(url.startsWith('https://custom-checkout.example')).toBe(true);
  });
});
