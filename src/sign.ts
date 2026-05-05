import { createPrivateKey, createPublicKey, createSign, createVerify } from 'node:crypto';

/**
 * Signs the exact request body bytes with RSA-SHA256 (NovaPay external API).
 * @param body — same string that will be sent as the JSON body
 */
export function signRequestBody(body: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const sign = createSign('SHA256');
  sign.write(body);
  sign.end();
  return sign.sign(key, 'base64');
}

/**
 * Verifies an incoming postback using NovaPay's **public** RSA key (not the merchant key).
 * @see https://novapay.readme.io/reference/authentication
 */
export function verifyPostbackSignature(
  rawBody: string | Buffer,
  xSign: string,
  novapayPublicKeyPem: string,
): boolean {
  const key = createPublicKey(novapayPublicKeyPem);
  const verify = createVerify('SHA256');
  verify.write(rawBody);
  verify.end();
  return verify.verify(key, xSign, 'base64');
}
