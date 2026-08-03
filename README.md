# NovaPay Node.js Library

[![CI](https://github.com/NovaPay/novapay-node/actions/workflows/ci.yml/badge.svg)](https://github.com/NovaPay/novapay-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/novapay.svg)](https://www.npmjs.com/package/novapay)
[![install size](https://packagephobia.com/badge?p=novapay)](https://packagephobia.com/result?p=novapay)
[![license](https://img.shields.io/npm/l/novapay.svg)](LICENSE)

TypeScript client for the **NovaPay external API** — [Internet Acquiring](https://novapay.readme.io/reference/acquiring-requests) and [Checkout](https://novapay.readme.io/reference/checkout-requests). Requests are signed for you, postbacks are verified for you, every payload is typed.

📖 [Документація українською](README.uk.md)

**Contents** · [Requirements](#requirements) · [Install](#install) · [Quickstart](#quickstart) · [Postbacks](#postbacks) · [API](#api) · [Configuration](#configuration) · [Errors](#errors) · [Example app](#example-app) · [Development](#development)

## Requirements

- **Node.js 20.3+** — uses the global `fetch`, `AbortSignal.any` and `node:crypto`
- Ships **ESM and CommonJS** builds, no separate types package needed
- No runtime dependencies, and the published types need no `@types/node`

## Install

```bash
npm install novapay
```

## Quickstart

```ts
import { createClient, NovaPayEnvironment } from 'novapay';

const client = createClient({
  privateKeyPem: process.env.MERCHANT_PRIVATE_KEY_PEM!,
  novapayPublicKeyPem: process.env.NOVAPAY_PUBLIC_KEY_PEM!,
  environment: NovaPayEnvironment.Production,
  merchantId: '<your-merchant-id>',
});

const session = await client.acquiring.createSession({
  client_phone: '+380501112233',
  callback_url: 'https://your.api/novapay/postback',
});

const payment = await client.acquiring.addPayment({
  session_id: session.id,
  amount: 100.5,
});

console.log('Redirect the customer to:', payment.url);
```

`createSession` returns `{ id }` — that `id` is the session id you pass everywhere else.

Pass `use_hold: true` to `addPayment` to authorize now and capture later with `completeHold`.

### Checkout

Same client, same host, different paths. Checkout also collects delivery details.

```ts
const session = await client.checkout.createSession({
  callback_url: 'https://your.api/novapay/checkout-postback',
  client_phone: '+380501112233',
});

const payment = await client.checkout.addPayment({
  session_id: session.id,
  amount: 250,
});
```

## Postbacks

NovaPay signs postbacks with **its own** RSA public key (not your merchant key) and sends the signature in the **`x-sign-v2`** header — a different header from the `x-sign` on outgoing requests.

> **The signature covers the raw request body.** Verify before parsing. `JSON.stringify(req.body)` will not match and verification will fail.

```ts
import express from 'express';
import { NovaPaySignatureError, WEBHOOK_HEADER_X_SIGN } from 'novapay';

const app = express();
app.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = buf) }));

app.post('/novapay/postback', (req, res) => {
  const xSign = req.get(WEBHOOK_HEADER_X_SIGN);
  if (!xSign) return res.sendStatus(400);

  try {
    const postback = client.parsePostback((req as any).rawBody, xSign);
    console.log(postback.id, postback.status);   // `id` is the session id
  } catch (err) {
    if (err instanceof NovaPaySignatureError) return res.sendStatus(401);
    throw err;   // a missing key is a broken deployment — it must not answer 401
  }

  res.sendStatus(200);
});
```

`parsePostback` verifies the signature and then decodes — in that order, so an already re-serialized
body can never be the thing you verified.

The payload shape depends on the merchant's **postback version** — a per-merchant NovaPay setting.
`v1` (the default) sends one POST per payment with `external_id`, `amount` and `products` on the top
level; `v2` sends one POST per session with payments grouped under `payments[]`. Tell the client
which one your merchant uses and `parsePostback` returns the matching type:

```ts
import { PostbackVersion } from 'novapay';

const client = createClient({ privateKeyPem, merchantId, novapayPublicKeyPem, postbackVersion: PostbackVersion.v2 });
const postback = client.parsePostback(rawBody, xSign); // AcquiringPostbackV2
```

This affects typing only — the wire format is decided by NovaPay's settings for your merchant,
so the `postbackVersion` you pass must match the `postback_version` configured for your merchant
at NovaPay (ask their support if you are not sure which one is set). A mismatch means the types
describe fields that never arrive.

For a checkout postback pass `CheckoutPostbackV1` / `CheckoutPostbackV2` as the type argument:

```ts
const postback = client.parsePostback<CheckoutPostbackV2>(rawBody, xSign);
postback.delivery?.express_waybills;
```

`rawBody` takes `string | Uint8Array`, so a `Buffer` from any body parser fits as-is.

Catch `NovaPaySignatureError` and nothing wider. The other two throws are not 401s: a
`NovaPayConfigError` means you never passed `novapayPublicKeyPem`, and a `SyntaxError` means NovaPay
sent a signed body that is not JSON. Answering 401 to either buries a broken deployment under a loop
of NovaPay retries — let them 500 and page someone.

If you only need the boolean, `verifyPostback(rawBody, xSign)` does the check alone. Both throw
`NovaPayConfigError` if you did not pass `novapayPublicKeyPem` to `createClient`; on a signature
mismatch `parsePostback` throws `NovaPaySignatureError` where `verifyPostback` returns `false`.
To verify without a client:

```ts
import { verifyPostbackSignature } from 'novapay';

const ok = verifyPostbackSignature(rawBody, xSign, process.env.NOVAPAY_PUBLIC_KEY_PEM!);
```

Payload types: `AcquiringPostbackV1` / `AcquiringPostbackV2` and `CheckoutPostbackV1` /
`CheckoutPostbackV2`, named after the merchant postback version.

## API

Every method takes a body object, an optional [`RequestOptions`](#per-call-options), and returns a promise.

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
const s = await client.acquiring.getStatus({ session_id });

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
  merchantId,             // required — sent as merchant_id in every request body
  novapayPublicKeyPem,    // NovaPay RSA public key, verifies incoming postbacks
  environment,            // NovaPayEnvironment.Test (default) | .Production
  acquiringBaseUrl,       // override the resolved host (staging, mocks)
  checkoutBaseUrl,        // override the resolved host (staging, mocks)
  timeoutMs,              // default per-request timeout, 30_000
  fetchFn,                // custom fetch — proxies, instrumentation, tests
  postbackVersion,        // PostbackVersion.v1 (default) | .v2 — parsePostback payload type
});
```

Both PEM keys are parsed here, so a malformed key throws from `createClient` at startup instead of
failing on your first real payment.

### Per-call options

Every method accepts a second `RequestOptions` argument:

```ts
await client.acquiring.getStatus(
  { session_id },
  { signal: req.signal, timeoutMs: 5_000 },
);
```

| Option | Description |
|---|---|
| `signal` | Caller cancellation, combined with the timeout — whichever fires first aborts. Pass your server's request signal to drop the outgoing call when the customer closes the tab. |
| `timeoutMs` | Overrides the client's `timeoutMs` for this call only. |

Acquiring and Checkout share one host per environment:

| `environment` | Constant | Host |
|---|---|---|
| `NovaPayEnvironment.Test` *(default)* | `TEST_BASE_URL` | `https://api-qecom.novapay.ua` |
| `NovaPayEnvironment.Production` | `PRODUCTION_BASE_URL` | `https://api-ecom.novapay.ua` |

`getExternalApiBaseUrl(env)` resolves the host outside a client.

**Test (QE) keys** — merchant `2`, its private key and the NovaPay public key — are published in
[Authentication](https://novapay.readme.io/reference/authentication); test cards are in
[Test data](https://novapay.readme.io/reference/testing-data). Production keys are generated in the
Acquiring3 admin panel ([instructions](https://nova-pay.atlassian.net/wiki/spaces/EXT/pages/694779954/Acquiring3)).

**Note on keys in env vars:** PEM keys are multi-line. In a `.env` file either quote the whole value and keep real newlines, or store it base64-encoded and decode at startup — a PEM with literal `\n` will not parse.

## Errors

Everything the SDK throws extends `NovaPayError`, so a single `instanceof` catches all of it. Below that, the tree splits by what you can actually do about the error:

```
NovaPayError
├── NovaPayConfigError          your call is wrong — bad PEM, missing option. Fix the code.
├── NovaPaySignatureError       a postback did not match its x-sign-v2. Reject the request.
└── NovaPayApiError             NovaPay answered non-2xx.
    ├── NovaPayProcessingError    a documented business rejection.
    └── NovaPayValidationError    the body failed schema validation.
```

```ts
import {
  NovaPayApiError,
  NovaPayProcessingError,
  NovaPayValidationError,
} from 'novapay';

try {
  await client.acquiring.addPayment({ /* … */ });
} catch (err) {
  if (err instanceof NovaPayValidationError) {
    // You sent something wrong. Never retry this.
    console.error(err.paths, err.uuid);       // ['client_phone'], 'e7638147-…'
  } else if (err instanceof NovaPayProcessingError) {
    // NovaPay refused the operation. Branch on the code.
    if (err.code === 'SessionAlreadyRefundedError') return;
    console.error(err.code, err.error, err.uuid);
  } else if (err instanceof NovaPayApiError) {
    // 5xx, gateway HTML, anything undocumented.
    console.error(err.status, err.responseBody);
  }
  throw err;
}
```

Check the subclasses **before** `NovaPayApiError` — they extend it, so a plain `instanceof NovaPayApiError` matches all three.

`NovaPayApiError` — every non-2xx response:

| Property | Description |
|---|---|
| `status` | HTTP status code |
| `responseJson` | Parsed body, or `null` if it wasn't JSON |
| `responseBody` | Raw response text |

`NovaPayProcessingError` — a well-formed request rejected for a business reason:

| Property | Description |
|---|---|
| `code` | `'SessionNotFoundError'` \| `'SessionAlreadyRefundedError'` \| `'NotFoundError'` \| … — branch on this |
| `error` | Human-readable message, e.g. `'session already refunded'`. Not a contract |
| `description` | Extra detail, often empty |
| `uuid` | Server-side correlation id — quote it in support tickets |

`NovaPayValidationError` — the request body failed validation:

| Property | Description |
|---|---|
| `errors` | `[{ path: 'client_phone', code: 'invalid_type', message: '…' }]` |
| `paths` | Just the rejected field names, e.g. `['client_phone']` |
| `uuid` | Server-side correlation id |

A response only gets a subclass when the fields that subclass promises are actually present. A truncated or mislabelled 4xx stays a plain `NovaPayApiError` rather than handing you a `code` of `undefined`, so `err.code` is never a lie.

`uuid` is deliberately kept out of `err.message`: log aggregators group by message, and a per-request id in there would give you one group per error instead of one per kind.

`NovaPayConfigError` means a broken deployment, not a failed payment. A malformed PEM throws at `createClient` time, before any request; a *missing* `novapayPublicKeyPem` is only noticed by the first `verifyPostback`/`parsePostback` call, because nothing before it needs the key.

`NovaPaySignatureError` is thrown by `parsePostback` alone, and means exactly one thing: this postback was not signed by NovaPay. Answer 401 and drop it.

Cancellation rejects rather than resolves: a `timeoutMs` expiry throws a `TimeoutError`, and a caller-supplied `signal` throws that signal's abort reason (an `AbortError` by default). Both are `DOMException`s, not `NovaPayApiError` — no request reached NovaPay.

The other thing outside the `NovaPayError` tree is `JSON.parse`'s own `SyntaxError` from `parsePostback`: past the signature check the bytes are provably NovaPay's, so there is no merchant-side mistake left to classify.

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
