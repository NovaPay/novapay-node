import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import {
  HEADER_X_SIGN,
  paths,
  SDK_RUNTIME,
  SDK_SOURCE_NAME,
  SDK_VERSION,
  TEST_BASE_URL,
} from '../src/constants.js';
import { NovaPayApiError } from '../src/errors.js';
import { signRequestBody } from '../src/sign.js';
import { joinBaseAndPath } from '../src/url.js';

const merchantKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const novapayKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const merchantPrivateKeyPem = merchantKeys.privateKey;
const novapayPrivateKeyPem = novapayKeys.privateKey;
const novapayPublicKeyPem = novapayKeys.publicKey;

function headersFromInit(init: RequestInit | undefined): Headers {
  const raw = init?.headers;
  if (!raw) return new Headers();
  if (raw instanceof Headers) return raw;
  const out = new Headers();
  if (Array.isArray(raw)) {
    for (const [k, v] of raw) {
      out.append(k, v);
    }
    return out;
  }
  for (const [k, v] of Object.entries(raw as Record<string, string>)) {
    out.append(k, v);
  }
  return out;
}

function assertSignedJsonPost(
  url: string,
  init: RequestInit | undefined,
  expectedBody: unknown,
): void {
  expect(init?.method).toBe('POST');
  const headers = headersFromInit(init);
  expect(headers.get('content-type')).toContain('application/json');
  const bodyStr = typeof init?.body === 'string' ? init.body : '';
  expect(JSON.parse(bodyStr)).toEqual(expectedBody);
  const xSign = headers.get(HEADER_X_SIGN);
  expect(xSign).toBeTruthy();
  expect(xSign).toBe(signRequestBody(bodyStr, merchantPrivateKeyPem));
  expect(url).toBeTruthy();
}

describe('acquiring flow', () => {
  it('createSession then addPayment with signed requests', async () => {
    const acquiringSessionId = 'acq-sess-1';
    const payUrl = 'https://pay.example/acquire';

    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === joinBaseAndPath(TEST_BASE_URL, paths.acquiring.createSession)) {
        assertSignedJsonPost(url, init, {
          merchant_id: '2',
          client_phone: '+380501112233',
          callback_url: 'https://example.com/cb',
          metadata: { source_name: SDK_SOURCE_NAME, version: SDK_VERSION, runtime: SDK_RUNTIME },
        });
        return new Response(JSON.stringify({ id: acquiringSessionId }), { status: 200 });
      }
      if (url === joinBaseAndPath(TEST_BASE_URL, paths.acquiring.addPayment)) {
        assertSignedJsonPost(url, init, {
          merchant_id: '2',
          session_id: acquiringSessionId,
          amount: 100.5,
        });
        return new Response(JSON.stringify({ url: payUrl }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const client = createClient({
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });

    const session = await client.acquiring.createSession({
      merchant_id: '2',
      client_phone: '+380501112233',
      callback_url: 'https://example.com/cb',
    });
    expect(session.id).toBe(acquiringSessionId);

    const payment = await client.acquiring.addPayment({
      merchant_id: '2',
      session_id: acquiringSessionId,
      amount: 100.5,
    });
    expect(payment.url).toBe(payUrl);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('checkout flow', () => {
  it('createSession then addPayment hits checkout paths', async () => {
    const checkoutSessionId = 'chk-sess-1';

    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === joinBaseAndPath(TEST_BASE_URL, paths.checkout.createSession)) {
        assertSignedJsonPost(url, init, {
          merchant_id: '2',
          callback_url: 'https://example.com/cb',
          client_phone: '+380501112233',
          metadata: { source_name: SDK_SOURCE_NAME, version: SDK_VERSION, runtime: SDK_RUNTIME },
        });
        return new Response(JSON.stringify({ id: checkoutSessionId }), { status: 200 });
      }
      if (url === joinBaseAndPath(TEST_BASE_URL, paths.checkout.addPayment)) {
        assertSignedJsonPost(url, init, {
          merchant_id: '2',
          session_id: checkoutSessionId,
          amount: 250,
        });
        return new Response(JSON.stringify({ url: 'https://checkout.example/pay' }), {
          status: 200,
        });
      }
      return new Response('not found', { status: 404 });
    });

    const client = createClient({
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });

    const session = await client.checkout.createSession({
      merchant_id: '2',
      callback_url: 'https://example.com/cb',
      client_phone: '+380501112233',
    });
    expect(session.id).toBe(checkoutSessionId);

    await client.checkout.addPayment({
      merchant_id: '2',
      session_id: checkoutSessionId,
      amount: 250,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('full client flow (example parity)', () => {
  it('acquiring and checkout chains plus verifyPostback on one client', async () => {
    const acquiringSessionId = 'full-acq-1';
    const checkoutSessionId = 'full-chk-1';

    const fetchFn = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(paths.acquiring.createSession)) {
        return new Response(JSON.stringify({ id: acquiringSessionId }), { status: 200 });
      }
      if (url.endsWith(paths.acquiring.addPayment)) {
        return new Response(JSON.stringify({ url: 'https://pay.example' }), { status: 200 });
      }
      if (url.endsWith(paths.checkout.createSession)) {
        return new Response(JSON.stringify({ id: checkoutSessionId }), { status: 200 });
      }
      if (url.endsWith(paths.checkout.addPayment)) {
        return new Response(JSON.stringify({ url: 'https://checkout.example' }), { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });

    const client = createClient({
      privateKeyPem: merchantPrivateKeyPem,
      novapayPublicKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });

    const acqSession = await client.acquiring.createSession({
      merchant_id: '2',
      client_phone: '+380501112233',
      callback_url: 'https://example.com/cb',
    });
    expect(acqSession.id).toBe(acquiringSessionId);

    await client.acquiring.addPayment({
      merchant_id: '2',
      session_id: acquiringSessionId,
      amount: 100.5,
    });

    const chkSession = await client.checkout.createSession({
      merchant_id: '2',
      callback_url: 'https://example.com/cb',
      client_phone: '+380501112233',
    });
    expect(chkSession.id).toBe(checkoutSessionId);

    await client.checkout.addPayment({
      merchant_id: '2',
      session_id: checkoutSessionId,
      amount: 250,
    });

    expect(fetchFn).toHaveBeenCalledTimes(4);

    const rawPostback = JSON.stringify({ type: 'payment', id: acquiringSessionId });
    const xSign = signRequestBody(rawPostback, novapayPrivateKeyPem);
    expect(client.verifyPostback(rawPostback, xSign)).toBe(true);
  });
});

describe('verifyPostback', () => {
  it('returns false when body does not match signature', () => {
    const client = createClient({
      privateKeyPem: merchantPrivateKeyPem,
      novapayPublicKeyPem,
    });
    const raw = '{"ok":true}';
    const xSign = signRequestBody(raw, novapayPrivateKeyPem);
    expect(client.verifyPostback(`${raw} `, xSign)).toBe(false);
  });

  it('throws when novapayPublicKeyPem was not set on createClient', () => {
    const client = createClient({
      privateKeyPem: merchantPrivateKeyPem,
    });
    expect(() => client.verifyPostback('{}', 'abc')).toThrow(
      'verifyPostback requires novapayPublicKeyPem in createClient options',
    );
  });
});

describe('NovaPayApiError', () => {
  it('is thrown on non-2xx with status and response body', async () => {
    const errBody = JSON.stringify({ error: 'invalid_merchant' });
    const fetchFn = vi.fn(
      async () =>
        new Response(errBody, {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const client = createClient({
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });

    await expect(
      client.acquiring.createSession({
        merchant_id: '2',
        client_phone: '+380501112233',
      }),
    ).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(NovaPayApiError);
      if (e instanceof NovaPayApiError) {
        expect(e.status).toBe(422);
        expect(e.responseBody).toBe(errBody);
        expect(e.responseJson).toEqual(JSON.parse(errBody));
      }
      return true;
    });
  });
});
