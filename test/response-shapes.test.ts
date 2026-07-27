/**
 * Pins the response types to bodies actually recorded from the QE environment
 * (api-qecom.novapay.ua, merchant_id 2) on 2026-07-27. If NovaPay changes a shape,
 * replay a fresh body here and the type errors point at what moved.
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import type { NovaPayErrorBody } from '../src/errors.js';
import { NovaPayApiError } from '../src/errors.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** Recorded verbatim from QE. */
const RECORDED = {
  createSession: '{"id":"e7638147-3da7-46e6-ada4-017fcc09d1ce","metadata":null}',
  addPayment:
    '{"url":"https://qecom.novapay.ua/external/pay?sid=e7638147-3da7-46e6-ada4-017fcc09d1ce","id":"120191242509","session_id":"e7638147-3da7-46e6-ada4-017fcc09d1ce"}',
  checkoutAddPayment:
    '{"url":"https://qecom.novapay.ua/checkout/pay?sid=e321acee-1ba5-480f-81e2-92020e459e24","session_id":"e321acee-1ba5-480f-81e2-92020e459e24"}',
  /** complete-hold, void and expire all answer with a literal `null`. */
  expire: 'null',
  /** Hold session after the customer paid, before completeHold. */
  statusHolded:
    '{"id":"58b219fb-4a74-42ae-8de5-1f71a8bbb49d","metadata":{"client_fingerprint":"a518976a73a733e76d7d6109b03937f980019986ad5af23ca16b5e108ade2309","preprocess_client_id":null},"status":"holded","created_at":"2026-07-27T19:52:48.900+00:00","client_phone":"+380501112233","client_first_name":null,"client_last_name":null,"client_patronymic":null,"pan":"424242xxxxxx4242","rrn":null,"paytype":"card","approval_code":"1785182032.057","card_type":"VISA","transaction_status":"APPROVED","amount":"1.00","processing_result":"","operations":[{"transaction_id":"120191242512","external_id":null,"amount":"1.00","refunded_amount":null,"status":"holded"}]}',
  /** Same session after voidSession. */
  statusVoided:
    '{"id":"58b219fb-4a74-42ae-8de5-1f71a8bbb49d","metadata":{"client_fingerprint":"a518976a73a733e76d7d6109b03937f980019986ad5af23ca16b5e108ade2309","preprocess_client_id":null},"status":"voided","created_at":"2026-07-27T19:52:48.900+00:00","client_phone":"+380501112233","client_first_name":null,"client_last_name":null,"client_patronymic":null,"pan":"424242xxxxxx4242","rrn":null,"paytype":"card","approval_code":"1785182032.057","card_type":"VISA","transaction_status":"REFUNDED","amount":"1.00","processing_result":"","operations":[{"transaction_id":"120191242512","external_id":null,"amount":"1.00","refunded_amount":null,"status":"voided"}]}',
  getStatus:
    '{"id":"9369b6f2-b04f-4af5-9b49-c050ce926e37","metadata":null,"status":"expired","created_at":"2026-07-27T19:39:38.008+00:00","client_phone":"+380501112233","client_first_name":null,"client_last_name":null,"client_patronymic":null,"pan":null,"rrn":null,"paytype":"","approval_code":null,"card_type":null,"transaction_status":null,"amount":"10.00","processing_result":null,"operations":[{"transaction_id":"120191242505","external_id":null,"amount":"10.00","refunded_amount":null,"status":"expired"}]}',
  processingError:
    '{"uuid":"5e210f43-090c-452f-91a8-702cec42d8ec","type":"processing","error":"session already refunded","description":"","code":"SessionAlreadyRefundedError"}',
  validationError:
    '{"uuid":"336d70e3-9b2e-49fe-a6f4-d56e347613eb","type":"validation","errors":[{"message":"Invalid input: expected string, received undefined","code":"invalid_type","path":"client_phone"}]}',
};

function replay(body: string, status = 200) {
  const fetchFn = vi.fn(async () => new Response(body, { status }));
  return createClient({ privateKeyPem: privateKey, fetchFn: fetchFn as typeof fetch });
}

const req = { merchant_id: '2', session_id: 'sess-1' };

describe('recorded QE responses', () => {
  it('createSession carries id and metadata', async () => {
    const s = await replay(RECORDED.createSession).acquiring.createSession({
      merchant_id: '2',
      client_phone: '+380501112233',
    });
    expect(s.id).toBe('e7638147-3da7-46e6-ada4-017fcc09d1ce');
    expect(s.metadata).toBeNull();
  });

  it('acquiring addPayment carries a transaction id, checkout addPayment does not', async () => {
    const a = await replay(RECORDED.addPayment).acquiring.addPayment({ ...req, amount: 10 });
    expect(a.id).toBe('120191242509');

    const c = await replay(RECORDED.checkoutAddPayment).checkout.addPayment({ ...req, amount: 10 });
    expect(c.url).toContain('/checkout/pay');
    // `id` is absent on the wire — the type must not promise it.
    expect(c).not.toHaveProperty('id');
  });

  it('expire, completeHold and void all resolve to a literal null', async () => {
    const c = replay(RECORDED.expire);
    await expect(c.acquiring.expireSession(req)).resolves.toBeNull();
    await expect(c.acquiring.completeHold(req)).resolves.toBeNull();
    await expect(c.acquiring.voidSession(req)).resolves.toBeNull();
    await expect(c.checkout.expireSession(req)).resolves.toBeNull();
    await expect(c.checkout.completeHold(req)).resolves.toBeNull();
    await expect(c.checkout.voidSession(req)).resolves.toBeNull();
  });

  it('a paid hold session fills the card fields', async () => {
    const s = await replay(RECORDED.statusHolded).acquiring.getStatus(req);
    expect(s.status).toBe('holded');
    expect(s.pan).toBe('424242xxxxxx4242');
    expect(s.paytype).toBe('card');
    expect(s.card_type).toBe('VISA');
    expect(s.transaction_status).toBe('APPROVED');
    expect(s.approval_code).toBe('1785182032.057');
    expect(s.processing_result).toBe(''); // empty string once paid, null before
    expect(s.rrn).toBeNull(); // stays null even after a real payment
    // NovaPay writes its own keys into metadata once the customer opens the pay page
    expect(s.metadata).toHaveProperty('client_fingerprint');
  });

  it('a voided session flips status and transaction_status but not refunded_amount', async () => {
    const s = await replay(RECORDED.statusVoided).acquiring.getStatus(req);
    expect(s.status).toBe('voided');
    expect(s.transaction_status).toBe('REFUNDED');
    expect(s.operations[0]?.status).toBe('voided');
    expect(s.operations[0]?.refunded_amount).toBeNull();
  });

  it('getStatus exposes amounts as decimal strings and operations as an array', async () => {
    const s = await replay(RECORDED.getStatus).acquiring.getStatus(req);
    expect(s.status).toBe('expired');
    expect(s.amount).toBe('10.00');
    expect(s.paytype).toBe(''); // empty string, not null, before payment
    expect(s.pan).toBeNull();
    expect(s.operations).toHaveLength(1);
    expect(s.operations[0]?.transaction_id).toBe('120191242505');
    expect(s.operations[0]?.refunded_amount).toBeNull();
  });

  it('checkout getStatus replays through the same shape', async () => {
    const s = await replay(RECORDED.getStatus).checkout.getStatus(req);
    expect(s.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('error bodies discriminate on type', async () => {
    for (const [body, expected] of [
      [RECORDED.processingError, 'processing'],
      [RECORDED.validationError, 'validation'],
    ] as const) {
      const err = await replay(body, 400)
        .acquiring.voidSession(req)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NovaPayApiError);
      const parsed = (err as NovaPayApiError).responseJson as NovaPayErrorBody;
      expect(parsed.type).toBe(expected);
      expect(parsed.uuid).toBeTruthy();
      if (parsed.type === 'processing') {
        expect(parsed.code).toBe('SessionAlreadyRefundedError');
      } else {
        expect(parsed.errors[0]?.path).toBe('client_phone');
      }
    }
  });
});
