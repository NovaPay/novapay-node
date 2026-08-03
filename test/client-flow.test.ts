import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import {
  HEADER_X_SIGN,
  paths,
  SDK_RUNTIME,
  SDK_SOURCE_NAME,
  SDK_VERSION,
  TEST_BASE_URL,
} from '../src/constants.js';
import {
  NovaPayApiError,
  NovaPayConfigError,
  NovaPayError,
  NovaPayProcessingError,
  NovaPaySignatureError,
  NovaPayValidationError,
} from '../src/errors.js';
import {
  type AcquiringPostbackV1,
  type AcquiringPostbackV2,
  PostbackVersion,
} from '../src/postbacks/types-acquiring.js';
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
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });

    const session = await client.acquiring.createSession({
      client_phone: '+380501112233',
      callback_url: 'https://example.com/cb',
    });
    expect(session.id).toBe(acquiringSessionId);

    const payment = await client.acquiring.addPayment({
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
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });

    const session = await client.checkout.createSession({
      callback_url: 'https://example.com/cb',
      client_phone: '+380501112233',
    });
    expect(session.id).toBe(checkoutSessionId);

    await client.checkout.addPayment({
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
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      novapayPublicKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });

    const acqSession = await client.acquiring.createSession({
      client_phone: '+380501112233',
      callback_url: 'https://example.com/cb',
    });
    expect(acqSession.id).toBe(acquiringSessionId);

    await client.acquiring.addPayment({
      session_id: acquiringSessionId,
      amount: 100.5,
    });

    const chkSession = await client.checkout.createSession({
      callback_url: 'https://example.com/cb',
      client_phone: '+380501112233',
    });
    expect(chkSession.id).toBe(checkoutSessionId);

    await client.checkout.addPayment({
      session_id: checkoutSessionId,
      amount: 250,
    });

    expect(fetchFn).toHaveBeenCalledTimes(4);

    const rawPostback = JSON.stringify({ type: 'payment', id: acquiringSessionId });
    const xSign = signRequestBody(rawPostback, novapayPrivateKeyPem);
    expect(client.verifyPostback(rawPostback, xSign)).toBe(true);
  });
});

describe('key validation', () => {
  it('createClient rejects a malformed private key PEM', () => {
    expect(() => createClient({ merchantId: '2', privateKeyPem: 'not-a-pem' })).toThrow(
      /privateKeyPem is not a valid private key PEM/,
    );
  });

  it('createClient rejects a malformed NovaPay public key PEM', () => {
    expect(() =>
      createClient({
        merchantId: '2',
        privateKeyPem: merchantPrivateKeyPem,
        novapayPublicKeyPem: 'not-a-pem',
      }),
    ).toThrow(/novapayPublicKeyPem is not a valid public key PEM/);
  });

  it('names the literal-backslash-n footgun, the most common .env mistake', () => {
    // What a PEM looks like after being pasted into .env unquoted.
    const flattened = merchantPrivateKeyPem.replaceAll('\n', '\\n');
    expect(() => createClient({ merchantId: '2', privateKeyPem: flattened })).toThrow(
      /literal \\n will not parse/,
    );
  });
});

describe('verifyPostback', () => {
  it('verifies raw bytes, not just strings', () => {
    const client = createClient({
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      novapayPublicKeyPem,
    });
    const raw = '{"id":"sess-1","status":"paid"}';
    const xSign = signRequestBody(raw, novapayPrivateKeyPem);
    // Express hands you a Buffer; a plain Uint8Array must work too.
    expect(client.verifyPostback(Buffer.from(raw), xSign)).toBe(true);
    expect(client.verifyPostback(new Uint8Array(Buffer.from(raw)), xSign)).toBe(true);
  });

  it('returns false when body does not match signature', () => {
    const client = createClient({
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      novapayPublicKeyPem,
    });
    const raw = '{"ok":true}';
    const xSign = signRequestBody(raw, novapayPrivateKeyPem);
    expect(client.verifyPostback(`${raw} `, xSign)).toBe(false);
  });

  it('throws when novapayPublicKeyPem was not set on createClient', () => {
    const client = createClient({
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
    });
    expect(() => client.verifyPostback('{}', 'abc')).toThrow(
      'verifyPostback requires novapayPublicKeyPem in createClient options',
    );
  });
});

describe('parsePostback', () => {
  const client = createClient({
    merchantId: '2',
    privateKeyPem: merchantPrivateKeyPem,
    novapayPublicKeyPem,
  });

  it('verifies then decodes, from a string and from raw bytes', () => {
    const raw = '{"id":"sess-1","status":"paid","metadata":{"order_id":"42"}}';
    const xSign = signRequestBody(raw, novapayPrivateKeyPem);
    expect(client.parsePostback(raw, xSign)).toMatchObject({ id: 'sess-1', status: 'paid' });
    // Express hands you a Buffer; a plain Uint8Array must work too.
    expect(client.parsePostback(Buffer.from(raw), xSign)).toMatchObject({ id: 'sess-1' });
    expect(client.parsePostback(new Uint8Array(Buffer.from(raw)), xSign)).toMatchObject({
      id: 'sess-1',
    });
  });

  it('throws NovaPaySignatureError before decoding when the body does not match', () => {
    const raw = '{"id":"sess-1","status":"paid"}';
    const xSign = signRequestBody(raw, novapayPrivateKeyPem);
    expect(() => client.parsePostback(`${raw} `, xSign)).toThrow(NovaPaySignatureError);
  });

  it('lets JSON.parse throw on a verified body that is not JSON', () => {
    const raw = 'not json';
    const xSign = signRequestBody(raw, novapayPrivateKeyPem);
    expect(() => client.parsePostback(raw, xSign)).toThrow(SyntaxError);
  });

  it('throws when novapayPublicKeyPem was not set on createClient', () => {
    const bare = createClient({ merchantId: '2', privateKeyPem: merchantPrivateKeyPem });
    expect(() => bare.parsePostback('{}', 'abc')).toThrow(NovaPayConfigError);
  });

  it('defaults the payload type to the postbackVersion set on createClient', () => {
    const v2client = createClient({
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      novapayPublicKeyPem,
      postbackVersion: PostbackVersion.v2,
    });
    const raw = '{"id":"sess-1","payments":[{"external_id":"42","amount":"10.00"}]}';
    const xSign = signRequestBody(raw, novapayPrivateKeyPem);
    // The option is typing-only: default client parses a v1 body, v2 client a v2 body.
    expectTypeOf(client.parsePostback(raw, xSign)).toEqualTypeOf<AcquiringPostbackV1>();
    expectTypeOf(v2client.parsePostback(raw, xSign)).toEqualTypeOf<AcquiringPostbackV2>();
    expect(v2client.parsePostback(raw, xSign).payments?.[0]?.external_id).toBe('42');
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
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });

    await expect(
      client.acquiring.createSession({
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

describe('error class hierarchy', () => {
  const caught = async (body: string, status: number) => {
    const fetchFn = vi.fn(async () => new Response(body, { status }));
    const client = createClient({
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });
    return client.acquiring
      .voidSession({ session_id: 'x' })
      .then(() => undefined)
      .catch((e: unknown) => e);
  };

  it('throws NovaPayProcessingError with the fields already narrowed', async () => {
    const err = await caught(
      '{"uuid":"u-1","type":"processing","error":"session already refunded","description":"d","code":"SessionAlreadyRefundedError"}',
      400,
    );
    expect(err).toBeInstanceOf(NovaPayProcessingError);
    if (!(err instanceof NovaPayProcessingError)) throw new Error('unreachable');
    // No cast needed to reach any of these.
    expect(err.code).toBe('SessionAlreadyRefundedError');
    expect(err.error).toBe('session already refunded');
    expect(err.description).toBe('d');
    expect(err.uuid).toBe('u-1');
    expect(err.status).toBe(400);
    expect(err.name).toBe('NovaPayProcessingError');
    expect(err.message).toContain('SessionAlreadyRefundedError: session already refunded');
    // The uuid stays off the message so log aggregators can group on it.
    expect(err.message).not.toContain('u-1');
  });

  it('throws NovaPayValidationError carrying every rejected field', async () => {
    const err = await caught(
      '{"uuid":"u-2","type":"validation","errors":[{"message":"m","code":"invalid_type","path":"client_phone"}]}',
      400,
    );
    expect(err).toBeInstanceOf(NovaPayValidationError);
    if (!(err instanceof NovaPayValidationError)) throw new Error('unreachable');
    expect(err.errors).toHaveLength(1);
    expect(err.errors[0]?.path).toBe('client_phone');
    expect(err.paths).toEqual(['client_phone']);
    expect(err.uuid).toBe('u-2');
    expect(err.message).toContain('client_phone (invalid_type)');
  });

  it('truncates the message but not the data when many fields fail', async () => {
    const errors = ['a', 'b', 'c', 'd', 'e'].map((path) => ({
      message: 'm',
      code: 'invalid_type',
      path,
    }));
    const err = await caught(JSON.stringify({ uuid: 'u', type: 'validation', errors }), 400);
    if (!(err instanceof NovaPayValidationError)) throw new Error('expected validation error');
    expect(err.message).toContain('+2 more');
    expect(err.errors).toHaveLength(5);
  });

  it('every API error subclass is catchable as NovaPayApiError and NovaPayError', async () => {
    for (const body of [
      '{"uuid":"u","type":"processing","error":"e","description":"","code":"C"}',
      '{"uuid":"u","type":"validation","errors":[]}',
      '<html>502</html>',
    ]) {
      const err = await caught(body, 400);
      expect(err).toBeInstanceOf(NovaPayApiError);
      expect(err).toBeInstanceOf(NovaPayError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('falls back to NovaPayApiError for bodies that are not one of the two shapes', async () => {
    for (const body of ['<html>502</html>', '{"message":"nope"}', 'null']) {
      const err = await caught(body, 502);
      expect(err).toBeInstanceOf(NovaPayApiError);
      expect(err).not.toBeInstanceOf(NovaPayProcessingError);
      expect(err).not.toBeInstanceOf(NovaPayValidationError);
    }
  });

  it('refuses a subclass when the promised fields are missing', async () => {
    // Mislabelled bodies must not hand the caller `code: undefined`.
    for (const body of [
      '{"uuid":"u","type":"processing"}',
      '{"uuid":"u","type":"validation"}',
      '{"uuid":"u","type":"validation","errors":"nope"}',
    ]) {
      const err = await caught(body, 400);
      expect(err).toBeInstanceOf(NovaPayApiError);
      expect(err).not.toBeInstanceOf(NovaPayProcessingError);
      expect(err).not.toBeInstanceOf(NovaPayValidationError);
    }
  });

  it('reports validation with no field details rather than an empty message', async () => {
    const err = await caught('{"uuid":"u","type":"validation","errors":[]}', 400);
    expect((err as Error).message).toContain('no field details');
  });

  it('uses the description when a processing body carries an empty error text', async () => {
    const err = await caught(
      '{"uuid":"u","type":"processing","error":"","description":"d","code":"C"}',
      400,
    );
    expect((err as Error).message).toContain('C: processing error');
  });

  it('config mistakes are NovaPayConfigError, not bare Error', () => {
    expect(() => createClient({ merchantId: '2', privateKeyPem: 'nope' })).toThrow(
      NovaPayConfigError,
    );
    expect(() =>
      createClient({
        merchantId: '2',
        privateKeyPem: merchantPrivateKeyPem,
        novapayPublicKeyPem: 'nope',
      }),
    ).toThrow(NovaPayConfigError);
    const client = createClient({ merchantId: '2', privateKeyPem: merchantPrivateKeyPem });
    expect(() => client.verifyPostback('{}', 'abc')).toThrow(NovaPayConfigError);
    // Config errors share the base class but are not API errors.
    try {
      createClient({ merchantId: '2', privateKeyPem: 'nope' });
    } catch (e) {
      expect(e).toBeInstanceOf(NovaPayError);
      expect(e).not.toBeInstanceOf(NovaPayApiError);
      expect((e as Error).name).toBe('NovaPayConfigError');
      expect((e as Error).cause).toBeInstanceOf(Error);
    }
  });
});

describe('per-call RequestOptions', () => {
  it('forwards a caller signal and a timeout override on both clients', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      seen.push(init?.signal);
      return new Response('null', { status: 200 });
    });
    const client = createClient({
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
      timeoutMs: 60_000,
    });
    const ctrl = new AbortController();

    await client.acquiring.getStatus({ session_id: 'x' }, { signal: ctrl.signal });
    await client.checkout.getStatus({ session_id: 'x' }, { timeoutMs: 1_000 });
    await client.acquiring.expireSession({ session_id: 'x' });

    expect(seen).toHaveLength(3);
    for (const signal of seen) {
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('the caller signal aborts an in-flight client call', async () => {
    const ctrl = new AbortController();
    const fetchFn = vi.fn(
      (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')));
        }),
    );
    const client = createClient({
      merchantId: '2',
      privateKeyPem: merchantPrivateKeyPem,
      fetchFn: fetchFn as typeof fetch,
    });
    const pending = client.acquiring.getStatus({ session_id: 'x' }, { signal: ctrl.signal });
    ctrl.abort();
    await expect(pending).rejects.toThrow('cancelled');
  });
});
