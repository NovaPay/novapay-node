import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject,
} from 'node:crypto';
import { NovaPayConfigError } from './errors.js';

const PEM_HINT =
  'PEM keys are multi-line: in a .env file quote the value and keep real newlines, or store it ' +
  'base64-encoded and decode at startup — a PEM with literal \\n will not parse.';

/**
 * Parses a merchant private key up front so a bad PEM fails at `createClient` time
 * instead of surfacing as an OpenSSL decoder error on the first charge.
 * @internal
 */
export function parsePrivateKey(pem: string): KeyObject {
  try {
    return createPrivateKey(pem);
  } catch (cause) {
    throw new NovaPayConfigError(`privateKeyPem is not a valid private key PEM. ${PEM_HINT}`, {
      cause,
    });
  }
}

/** @internal */
export function parsePublicKey(pem: string): KeyObject {
  try {
    return createPublicKey(pem);
  } catch (cause) {
    throw new NovaPayConfigError(`novapayPublicKeyPem is not a valid public key PEM. ${PEM_HINT}`, {
      cause,
    });
  }
}

/** @internal */
export function signWithKey(body: string, privateKey: KeyObject): string {
  const sign = createSign('SHA256');
  sign.write(body);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

/** @internal */
export function verifyWithKey(
  rawBody: string | Uint8Array,
  xSign: string,
  publicKey: KeyObject,
): boolean {
  const verify = createVerify('SHA256');
  verify.write(rawBody);
  verify.end();
  return verify.verify(publicKey, xSign, 'base64');
}

/**
 * Signs the exact request body bytes with RSA-SHA256 (NovaPay external API).
 *
 * Parses the PEM on every call — {@link import('./client.js').createClient} caches the parsed
 * key instead, so prefer a client over calling this per request.
 *
 * @param body — same string that will be sent as the JSON body
 */
export function signRequestBody(body: string, privateKeyPem: string): string {
  return signWithKey(body, parsePrivateKey(privateKeyPem));
}

/**
 * Verifies an incoming postback using NovaPay's **public** RSA key (not the merchant key).
 *
 * `rawBody` must be the untouched request bytes — a `Buffer` from your body parser works,
 * `JSON.stringify(req.body)` does not.
 *
 * @see https://novapay.readme.io/reference/authentication
 */
export function verifyPostbackSignature(
  rawBody: string | Uint8Array,
  xSign: string,
  novapayPublicKeyPem: string,
): boolean {
  return verifyWithKey(rawBody, xSign, parsePublicKey(novapayPublicKeyPem));
}
