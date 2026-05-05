import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
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
  it('returns undefined for an empty 2xx body', async () => {
    await expect(post(200, '')).resolves.toBeUndefined();
  });

  it('returns undefined when a 2xx body is not JSON', async () => {
    await expect(post(200, 'OK')).resolves.toBeUndefined();
  });

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

  it('throws NovaPayApiError with undefined responseJson for a non-JSON error body', async () => {
    await expect(post(500, 'nope')).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(NovaPayApiError);
      if (e instanceof NovaPayApiError) {
        expect(e.status).toBe(500);
        expect(e.responseBody).toBe('nope');
        expect(e.responseJson).toBeUndefined();
      }
      return true;
    });
  });
});
