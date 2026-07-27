# novapay

[![CI](https://github.com/NovaPay/novapay-node/actions/workflows/ci.yml/badge.svg)](https://github.com/NovaPay/novapay-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/novapay.svg)](https://www.npmjs.com/package/novapay)
[![license](https://img.shields.io/npm/l/novapay.svg)](LICENSE)

TypeScript SDK для **зовнішнього API NovaPay**: [Internet Acquiring](https://novapay.readme.io/reference/acquiring-requests) та [Checkout](https://novapay.readme.io/reference/checkout-requests) (Node.js 18+).

- Вихідні запити підписуються **приватним RSA-ключем** мерчанта (`x-sign`, **SHA-256** над точним JSON-тілом). Див. [Authentication](https://novapay.readme.io/reference/authentication).
- Postback-и слід перевіряти **публічним** ключем NovaPay (не публічним ключем мерчанта).

## Встановлення

```bash
npm install novapay
```

## Використання

```ts
import { createClient, NovaPayEnvironment } from 'novapay';

const client = createClient({
  privateKeyPem: process.env.NOVAPAY_PRIVATE_KEY_PEM!,
  novapayPublicKeyPem: process.env.NOVAPAY_PUBLIC_KEY_PEM!,
  environment: NovaPayEnvironment.Production,
});

const session = await client.acquiring.createSession({
  merchant_id: '2',
  client_phone: '+380501112233',
  callback_url: 'https://your.api/novapay/callback',
});

const payment = await client.acquiring.addPayment({
  merchant_id: '2',
  session_id: session.session_id!,
  amount: 100.5,
});

console.log('Pay URL:', payment.url);
```

### Checkout

```ts
const checkoutSession = await client.checkout.createSession({
  merchant_id: '2',
  callback_url: 'https://your.api/novapay/checkout-callback',
  client_phone: '+380501112233',
});

await client.checkout.addPayment({
  merchant_id: '2',
  session_id: checkoutSession.session_id!,
  amount: 250,
});
```

### Перевірка postback (`x-sign`)

```ts
import { verifyNovaPayPostback } from 'novapay';

const ok = verifyNovaPayPostback({
  rawBody: rawRequestBodyString,
  xSign: request.headers['x-sign'] as string,
  novapayPublicKeyPem: process.env.NOVAPAY_PUBLIC_KEY_PEM!,
});
```

Або використовуйте `client.verifyPostback(rawBody, xSign)`, якщо при створенні `createClient` передали `novapayPublicKeyPem`.

## Середовище

Передайте **`environment`** у `createClient` (за замовчуванням **`NovaPayEnvironment.Test`**). Acquiring і Checkout використовують той самий хост для обраного середовища.

Необов’язкові **`acquiringBaseUrl`** / **`checkoutBaseUrl`** перевизначають зібрану URL (наприклад, staging або моки).

| `environment` | Константа базової URL | Хост |
|----------------|----------------------|------|
| `NovaPayEnvironment.Test` (за замовчуванням) | `TEST_BASE_URL` | `https://api-qecom.novapay.ua` |
| `NovaPayEnvironment.Production` | `PRODUCTION_BASE_URL` | `https://api-ecom.novapay.ua` |

Також можна викликати `getExternalApiBaseUrl(NovaPayEnvironment.Production)`, якщо потрібна URL поза клієнтом.

Checkout використовує **той самий хост**, що й acquiring; шляхи відрізняються (наприклад, `POST /v1/checkout/session`).

## Приклад

QE: лендінг на Express + hbs — дві кнопки (hold і звичайне списання), сторінки `success`/`fail`, підписаний postback, список покупок із `completeHold`/`voidSession` — див. **[example/README.md](example/README.md)**.

## Довідник API

Повні списки полів і схеми postback: [NovaPay API Reference](https://novapay.readme.io/reference).

## Ліцензія

MIT

---

## English

TypeScript SDK for **NovaPay external API**: [Internet Acquiring](https://novapay.readme.io/reference/acquiring-requests) and [Checkout](https://novapay.readme.io/reference/checkout-requests) (Node.js 18+).

- Outgoing requests are signed with your merchant **RSA private key** (`x-sign`, **SHA-256** over the exact JSON body). See [Authentication](https://novapay.readme.io/reference/authentication).
- Postbacks should be verified with NovaPay’s **public** key (not your merchant public key).

### Install

```bash
npm install novapay
```

### Usage

```ts
import { createClient, NovaPayEnvironment } from 'novapay';

const client = createClient({
  privateKeyPem: process.env.NOVAPAY_PRIVATE_KEY_PEM!,
  novapayPublicKeyPem: process.env.NOVAPAY_PUBLIC_KEY_PEM!,
  environment: NovaPayEnvironment.Production,
});

const session = await client.acquiring.createSession({
  merchant_id: '2',
  client_phone: '+380501112233',
  callback_url: 'https://your.api/novapay/callback',
});

const payment = await client.acquiring.addPayment({
  merchant_id: '2',
  session_id: session.session_id!,
  amount: 100.5,
});

console.log('Pay URL:', payment.url);
```

#### Checkout

```ts
const checkoutSession = await client.checkout.createSession({
  merchant_id: '2',
  callback_url: 'https://your.api/novapay/checkout-callback',
  client_phone: '+380501112233',
});

await client.checkout.addPayment({
  merchant_id: '2',
  session_id: checkoutSession.session_id!,
  amount: 250,
});
```

#### Verify postback (`x-sign`)

```ts
import { verifyNovaPayPostback } from 'novapay';

const ok = verifyNovaPayPostback({
  rawBody: rawRequestBodyString,
  xSign: request.headers['x-sign'] as string,
  novapayPublicKeyPem: process.env.NOVAPAY_PUBLIC_KEY_PEM!,
});
```

Or use `client.verifyPostback(rawBody, xSign)` if you passed `novapayPublicKeyPem` into `createClient`.

### Environment

Pass **`environment`** to `createClient` (defaults to **`NovaPayEnvironment.Test`**). Acquiring and Checkout share the same host for that environment.

Optional **`acquiringBaseUrl`** / **`checkoutBaseUrl`** override the resolved URL (e.g. staging or mocks).

| `environment` | Base URL constant | Host |
|----------------|-------------------|------|
| `NovaPayEnvironment.Test` (default) | `TEST_BASE_URL` | `https://api-qecom.novapay.ua` |
| `NovaPayEnvironment.Production` | `PRODUCTION_BASE_URL` | `https://api-ecom.novapay.ua` |

You can also call `getExternalApiBaseUrl(NovaPayEnvironment.Production)` if you need the URL outside the client.

Checkout uses the **same host** as acquiring; paths differ (for example `POST /v1/checkout/session`).

### Example

QE demo: **Express + hbs** landing with two buy buttons (hold and direct charge), `success`/`fail` pages, signed postbacks and a purchases list with `completeHold`/`voidSession` — see **[example/README.md](example/README.md)**.

### API reference

Full field lists and postback schemas: [NovaPay API Reference](https://novapay.readme.io/reference).

### License

MIT
