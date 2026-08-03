import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { paths, SDK_RUNTIME, SDK_SOURCE_NAME, SDK_VERSION } from '../src/constants.js';

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
  const client = createClient({
    merchantId: '2',
    privateKeyPem: privateKey,
    fetchFn: fetchFn as typeof fetch,
  });
  return { client, calls };
}

const body = { session_id: 'sess-1' };

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

describe('createSession SDK metadata', () => {
  it('stamps source_name/version/runtime and keeps merchant keys, SDK wins on a collision', async () => {
    const sent: unknown[] = [];
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    });
    const client = createClient({
      merchantId: '2',
      privateKeyPem: privateKey,
      fetchFn: fetchFn as typeof fetch,
    });

    await client.acquiring.createSession({ client_phone: '+380501112233' });
    await client.checkout.createSession({ callback_url: 'https://x/cb' });
    await client.acquiring.createSession({
      client_phone: '+380501112233',
      metadata: { order_id: '42', source_name: 'my_shop' },
    });

    const stamp = { source_name: SDK_SOURCE_NAME, version: SDK_VERSION, runtime: SDK_RUNTIME };
    expect(sent[0]).toMatchObject({ metadata: stamp });
    expect(sent[1]).toMatchObject({ metadata: stamp });
    // Merchant keys are kept; the three SDK keys win on a name collision, so attribution
    // cannot be lost by a caller spreading its own metadata.
    expect(sent[2]).toMatchObject({ metadata: { ...stamp, order_id: '42' } });
  });
});
