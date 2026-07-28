# NovaPay Node.js Library

[![CI](https://github.com/NovaPay/novapay-node/actions/workflows/ci.yml/badge.svg)](https://github.com/NovaPay/novapay-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/novapay.svg)](https://www.npmjs.com/package/novapay)
[![license](https://img.shields.io/npm/l/novapay.svg)](LICENSE)

TypeScript client for the **NovaPay external API** — [Internet Acquiring](https://novapay.readme.io/reference/acquiring-requests) and [Checkout](https://novapay.readme.io/reference/checkout-requests). Requests are signed for you, postbacks are verified for you, every payload is typed.

📖 [Документація українською](README.uk.md)

## Requirements

- **Node.js 18+** — uses the global `fetch` and `node:crypto`
- Ships **ESM and CommonJS** builds, no separate types package needed
- No runtime dependencies

## Install

```bash
npm install novapay
```

## Quickstart

```ts
import { createClient, NovaPayEnvironment } from 'novapay';

const client = createClient({
  privateKeyPem: process.env.NOVAPAY_PRIVATE_KEY_PEM!,
  novapayPublicKeyPem: process.env.NOVAPAY_PUBLIC_KEY_PEM!,
  environment: NovaPayEnvironment.Production,
});

const session = await client.acquiring.createSession({
  merchant_id: '<your-merchant-id>',
  client_phone: '+380501112233',
  callback_url: 'https://your.api/novapay/postback',
});

const payment = await client.acquiring.addPayment({
  merchant_id: '<your-merchant-id>',
  session_id: session.id,
  amount: 100.5,
});

console.log('Redirect the customer to:', payment.url);
```

`createSession` returns `{ id }` — that `id` is the session id you pass everywhere else.

Both `createSession` methods stamp `metadata.source_name` (`novapay_node`), `metadata.version` (this package's version) and `metadata.runtime` (`node/<process.versions.node>`) so NovaPay can attribute traffic. Your own `metadata` keys are merged on top and win, so you can override any of them.

Pass `use_hold: true` to `addPayment` to authorize now and capture later with `completeHold`.

### Checkout

Same client, same host, different paths. Checkout also collects delivery details.

```ts
const session = await client.checkout.createSession({
  merchant_id: '<your-merchant-id>',
  callback_url: 'https://your.api/novapay/checkout-postback',
  client_phone: '+380501112233',
});

const payment = await client.checkout.addPayment({
  merchant_id: '<your-merchant-id>',
  session_id: session.id,
  amount: 250,
});
```

## Postbacks

NovaPay signs postbacks with **its own** RSA public key (not your merchant key) and sends the signature in the **`x-sign-v2`** header — a different header from the `x-sign` on outgoing requests.

> **The signature covers the raw request body.** Verify before parsing. `JSON.stringify(req.body)` will not match and verification will fail.

```ts
import express from 'express';
import { WEBHOOK_HEADER_X_SIGN, type AcquiringPostbackV3 } from 'novapay';

const app = express();
app.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = buf) }));

app.post('/novapay/postback', (req, res) => {
  const xSign = req.get(WEBHOOK_HEADER_X_SIGN);
  if (!xSign || !client.verifyPostback((req as any).rawBody, xSign)) {
    return res.sendStatus(401);
  }

  const postback = req.body as AcquiringPostbackV3;
  console.log(postback.id, postback.status);
  res.sendStatus(200);
});
```

`client.verifyPostback` throws if you did not pass `novapayPublicKeyPem` to `createClient`. To verify without a client:

```ts
import { verifyPostbackSignature } from 'novapay';

const ok = verifyPostbackSignature(rawBody, xSign, process.env.NOVAPAY_PUBLIC_KEY_PEM!);
```

Payload types: `AcquiringPostbackV3` and `CheckoutPostbackV3` (v3, current as of 2025-10-01).

## API

Every method takes one object and returns a promise.

| Method | Path | Returns |
|---|---|---|
| `createSession(body)` | `POST /v1/session` | `SessionCreateResponse` |
| `addPayment(body)` | `POST /v1/payment` | `SessionPaymentResponse` |
| `getStatus(body)` | `POST /v1/get-status` | `SessionStatusResponse` |
| `completeHold(body)` | `POST /v1/complete-hold` | `null` |
| `voidSession(body)` | `POST /v1/void` | `null` |
| `expireSession(body)` | `POST /v1/expire` | `null` |

`client.checkout` exposes the same six methods. `createSession` and `addPayment` use `/v1/checkout/*`, the rest share the acquiring endpoints.

Two checkout differences worth knowing:

- `checkout.addPayment` returns `CheckoutPaymentResponse` — **`{ url, session_id }` with no `id`**. The transaction id only appears later in `getStatus` under `operations[].transaction_id`.
- A checkout session starts in status `precreated`, an acquiring one in `created`.

**`completeHold`, `voidSession` and `expireSession` return no data** — the response body is a literal `null`. They succeeded if they didn't throw. `getStatus` is the only way to observe what they did.

### Session lifecycle

```
createSession ──▶ created / precreated
                       │
              customer pays
                       ├── use_hold: true ──▶ holded ──completeHold──▶ paid
                       └── use_hold: false ─────────────────────────▶ paid
                                                                       │
                                                                  voidSession
                                                                       ▼
                                                                     voided
```

`expireSession` moves an unpaid session to `expired`. `voidSession` works on a direct charge and on a captured hold alike.

### `SessionStatusResponse`

```ts
const s = await client.acquiring.getStatus({ merchant_id, session_id });

s.status;              // 'created' | 'precreated' | 'holded' | 'paid' | 'voided' | 'expired'
s.transaction_status;  // 'APPROVED' | 'REFUNDED' | null
s.amount;              // '1.00' — decimal string, not a number
s.pan;                 // '424242xxxxxx4242' — masked, null before payment
s.paytype;             // 'card'; empty string (not null) before payment
s.card_type;           // 'VISA'
s.approval_code;       // '1785182032.057'
s.operations;          // [{ transaction_id, external_id, amount, refunded_amount, status }]
```

Three things that bite:

- **Amounts are decimal strings** (`'1.00'`), not numbers. Don't compare them with `===` against a number.
- **`refunded_amount` stays `null` even after a successful void.** Detect refunds via `status === 'voided'` or `transaction_status === 'REFUNDED'`.
- **`rrn` stayed `null` even on a paid session**, and `processing_result` is `null` before payment but `''` after. Neither is a reliable success signal — use `status`.

`status` and `transaction_status` are open unions: known values autocomplete, unrecognised ones still type-check, so a new NovaPay status won't break your build.

Request types are exported too: `CreateSessionRequest`, `AddPaymentRequest`, `CompleteHoldRequest`, `SessionIdRequest`, `CreateCheckoutSessionRequest`, `AddCheckoutPaymentRequest`.

## Configuration

```ts
createClient({
  privateKeyPem,          // required — merchant RSA private key, signs outgoing requests
  novapayPublicKeyPem,    // NovaPay RSA public key, verifies incoming postbacks
  environment,            // NovaPayEnvironment.Test (default) | .Production
  acquiringBaseUrl,       // override the resolved host (staging, mocks)
  checkoutBaseUrl,        // override the resolved host (staging, mocks)
  timeoutMs,              // per-request timeout, default 30_000
  fetchFn,                // custom fetch — proxies, instrumentation, tests
});
```

Acquiring and Checkout share one host per environment:

| `environment` | Constant | Host |
|---|---|---|
| `NovaPayEnvironment.Test` *(default)* | `TEST_BASE_URL` | `https://api-qecom.novapay.ua` |
| `NovaPayEnvironment.Production` | `PRODUCTION_BASE_URL` | `https://api-ecom.novapay.ua` |

`getExternalApiBaseUrl(env)` resolves the host outside a client.

**Note on keys in env vars:** PEM keys are multi-line. In a `.env` file either quote the whole value and keep real newlines, or store it base64-encoded and decode at startup — a PEM with literal `\n` will not parse.

## Errors

Any non-2xx response throws `NovaPayApiError`:

```ts
import { NovaPayApiError } from 'novapay';

try {
  await client.acquiring.addPayment({ /* … */ });
} catch (err) {
  if (err instanceof NovaPayApiError) {
    console.error(err.status, err.responseJson ?? err.responseBody);
  }
  throw err;
}
```

| Property | Description |
|---|---|
| `status` | HTTP status code |
| `responseJson` | Parsed body, or `undefined` if it wasn't JSON |
| `responseBody` | Raw response text |

4xx bodies come in two shapes, discriminated by `type`:

```ts
import type { NovaPayErrorBody } from 'novapay';

const body = err.responseJson as NovaPayErrorBody;

if (body.type === 'processing') {
  body.code;      // 'SessionNotFoundError' | 'SessionAlreadyRefundedError' | 'NotFoundError' | …
  body.error;     // 'session already refunded'
} else {
  body.errors;    // [{ path: 'client_phone', code: 'invalid_type', message: '…' }]
}
```

Branch on `code`, never on the `error` message. Both shapes carry a `uuid` — quote it in support tickets. Cast only after confirming the body is an object: 5xx and gateway responses are not guaranteed to follow either shape.

Timeouts abort the request and reject with an `AbortError`.

**There are no automatic retries.** `addPayment` is not idempotent — a blind retry can charge the customer twice. On a timeout or 5xx, call `getStatus` to find out what actually happened before retrying.

## Example app

A runnable Express + hbs storefront — hold and direct-charge buttons, success/fail pages, signed postbacks, and a purchases list wired to `completeHold` / `voidSession`:

```bash
npm run example
```

See [example/README.md](example/README.md) for the ngrok setup.

## Development

```bash
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # biome
npm run build      # tsup → dist/
```

Issues and pull requests: [github.com/NovaPay/novapay-node](https://github.com/NovaPay/novapay-node/issues).

## API reference

Full field lists, status values and postback schemas: [NovaPay API Reference](https://novapay.readme.io/reference).

## License

[MIT](LICENSE)
