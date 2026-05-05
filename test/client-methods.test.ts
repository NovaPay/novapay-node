import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { paths } from '../src/constants.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function clientWithRecorder() {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (input: string | URL) => {
    calls.push(String(input));
    return new Response('{}', { status: 200 });
  });
  const client = createClient({ privateKeyPem: privateKey, fetchFn: fetchFn as typeof fetch });
  return { client, calls };
}

const body = { merchant_id: '2', session_id: 'sess-1' };

describe('acquiring void/completeHold/expire', () => {
  it('hit their documented paths', async () => {
    const { client, calls } = clientWithRecorder();
    await client.acquiring.voidSession(body);
    await client.acquiring.completeHold(body);
    await client.acquiring.expireSession(body);
    expect(calls[0]).toContain(paths.acquiring.voidSession);
    expect(calls[1]).toContain(paths.acquiring.completeHold);
    expect(calls[2]).toContain(paths.acquiring.expireSession);
  });
});

describe('checkout void/completeHold/expire', () => {
  it('hit their documented paths', async () => {
    const { client, calls } = clientWithRecorder();
    await client.checkout.voidSession(body);
    await client.checkout.completeHold(body);
    await client.checkout.expireSession(body);
    expect(calls[0]).toContain(paths.checkout.voidSession);
    expect(calls[1]).toContain(paths.checkout.completeHold);
    expect(calls[2]).toContain(paths.checkout.expireSession);
  });
});
