import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SDK_RUNTIME, SDK_VERSION } from '../src/constants.js';
import { NovaPayApiError } from '../src/errors.js';
import { signedPost } from '../src/http.js';
import { joinBaseAndPath } from '../src/url.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function post(status: number, bodyText: string) {
  const fn = vi.fn(async () => new Response(bodyText, { status }));
  return signedPost({
    baseUrl: 'https://h.example',
    path: '/v1/x',
    body: { a: 1 },
    privateKeyPem: privateKey,
    fetchFn: fn as typeof fetch,
  });
}

describe('joinBaseAndPath', () => {
  it('adds a missing leading slash and strips trailing slashes', () => {
    expect(joinBaseAndPath('https://h.example/', 'v1/x')).toBe('https://h.example/v1/x');
  });
});

describe('signedPost body parsing', () => {
  it('returns null for an empty 2xx body', async () => {
    await expect(post(200, '')).resolves.toBeNull();
  });

  it('returns null when a 2xx body is not JSON', async () => {
    await expect(post(200, 'OK')).resolves.toBeNull();
  });

  it('throws NovaPayApiError with null responseJson for a non-JSON error body', async () => {
    await expect(post(500, 'nope')).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(NovaPayApiError);
      if (e instanceof NovaPayApiError) {
        expect(e.status).toBe(500);
        expect(e.responseBody).toBe('nope');
        expect(e.responseJson).toBeNull();
      }
      return true;
    });
  });
});

describe('signedPost headers', () => {
  it('identifies the SDK on every request, not just createSession', async () => {
    const fn = vi.fn(async () => new Response('null', { status: 200 }));
    await signedPost({
      baseUrl: 'https://h.example',
      path: '/v1/x',
      body: {},
      privateKeyPem: privateKey,
      fetchFn: fn as typeof fetch,
    });
    const headers = new Headers((fn.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
    expect(headers.get('user-agent')).toBe(`novapay-node/${SDK_VERSION} ${SDK_RUNTIME}`);
    expect(headers.get('accept')).toBe('application/json');
  });
});

describe('signedPost cancellation', () => {
  it('aborts the request after timeoutMs', async () => {
    const fetchFn = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await expect(
      signedPost({
        baseUrl: 'https://h.example',
        path: '/v1/x',
        body: {},
        privateKeyPem: privateKey,
        fetchFn: fetchFn as typeof fetch,
        timeoutMs: 5,
      }),
    ).rejects.toThrow('aborted');
  });

  it('aborts when the caller signal fires before the timeout', async () => {
    const ctrl = new AbortController();
    const fetchFn = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('caller aborted')));
        }),
    );
    const pending = signedPost({
      baseUrl: 'https://h.example',
      path: '/v1/x',
      body: {},
      privateKeyPem: privateKey,
      fetchFn: fetchFn as typeof fetch,
      timeoutMs: 60_000,
      signal: ctrl.signal,
    });
    ctrl.abort();
    await expect(pending).rejects.toThrow('caller aborted');
  });
});

describe('signedPost default fetch', () => {
  it('falls back to globalThis.fetch when no fetchFn is given', async () => {
    // The path every real consumer takes; every other test injects fetchFn and skips it.
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('null', { status: 200 }));
    try {
      await expect(
        signedPost({
          baseUrl: 'https://h.example',
          path: '/v1/x',
          body: { a: 1 },
          privateKeyPem: privateKey,
        }),
      ).resolves.toBeNull();
      expect(spy).toHaveBeenCalledOnce();
      expect(String(spy.mock.calls[0]?.[0])).toBe('https://h.example/v1/x');
    } finally {
      spy.mockRestore();
    }
  });
});
