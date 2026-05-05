import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signRequestBody, verifyPostbackSignature } from '../src/sign.js';

describe('signRequestBody / verifyPostbackSignature', () => {
  it('round-trips RSA-SHA256 over UTF-8 JSON body', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const body = JSON.stringify({
      merchant_id: '2',
      client_phone: '+380931231234',
      callback_url: 'https://example.com',
      metadata: { order_id: '123', unicode: 'Привіт' },
    });
    const xSign = signRequestBody(body, privateKey);
    expect(typeof xSign).toBe('string');
    expect(xSign.length).toBeGreaterThan(0);
    expect(verifyPostbackSignature(body, xSign, publicKey)).toBe(true);
    expect(verifyPostbackSignature(`${body} `, xSign, publicKey)).toBe(false);
  });
});
