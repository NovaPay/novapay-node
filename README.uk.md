# NovaPay Node.js Library

[![CI](https://github.com/NovaPay/novapay-node/actions/workflows/ci.yml/badge.svg)](https://github.com/NovaPay/novapay-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/novapay.svg)](https://www.npmjs.com/package/novapay)
[![license](https://img.shields.io/npm/l/novapay.svg)](LICENSE)

TypeScript-клієнт для **зовнішнього API NovaPay** — [Internet Acquiring](https://novapay.readme.io/reference/acquiring-requests) і [Checkout](https://novapay.readme.io/reference/checkout-requests). Запити підписуються автоматично, postback-и перевіряються автоматично, усі payload-и типізовані.

📖 [Documentation in English](README.md)

## Вимоги

- **Node.js 18+** — використовує глобальний `fetch` і `node:crypto`
- Збірки **ESM і CommonJS**, типи вбудовані
- Без runtime-залежностей

## Встановлення

```bash
npm install novapay
```

## Швидкий старт

```ts
import { createClient, NovaPayEnvironment } from 'novapay';

const client = createClient({
  privateKeyPem: process.env.NOVAPAY_PRIVATE_KEY_PEM!,
  novapayPublicKeyPem: process.env.NOVAPAY_PUBLIC_KEY_PEM!,
  environment: NovaPayEnvironment.Production,
});

const session = await client.acquiring.createSession({
  merchant_id: '<ваш-merchant-id>',
  client_phone: '+380501112233',
  callback_url: 'https://your.api/novapay/postback',
});

const payment = await client.acquiring.addPayment({
  merchant_id: '<ваш-merchant-id>',
  session_id: session.id,
  amount: 100.5,
});

console.log('Редірект клієнта на:', payment.url);
```

`createSession` повертає `{ id }` — це і є ідентифікатор сесії для всіх наступних викликів.

Обидва `createSession` автоматично додають `metadata.source_name` (`novapay_node`), `metadata.version` (версія цього пакета) та `metadata.runtime` (`node/<process.versions.node>`), щоб NovaPay бачив джерело трафіку. Ваші власні ключі `metadata` мають пріоритет — будь-який із цих трьох можна перевизначити.

Передайте `use_hold: true` у `addPayment`, щоб заблокувати кошти зараз і списати пізніше через `completeHold`.

### Checkout

Той самий клієнт, той самий хост, інші шляхи. Checkout додатково збирає дані доставки.

```ts
const session = await client.checkout.createSession({
  merchant_id: '<ваш-merchant-id>',
  callback_url: 'https://your.api/novapay/checkout-postback',
  client_phone: '+380501112233',
});

const payment = await client.checkout.addPayment({
  merchant_id: '<ваш-merchant-id>',
  session_id: session.id,
  amount: 250,
});
```

## Postback-и

NovaPay підписує postback-и **своїм** публічним RSA-ключем (не ключем мерчанта) і передає підпис у заголовку **`x-sign-v2`** — це інший заголовок, ніж `x-sign` на вихідних запитах.

> **Підпис рахується по сирому тілу запиту.** Перевіряйте до парсингу: `JSON.stringify(req.body)` не збігається з оригіналом і перевірка провалиться.

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

`client.verifyPostback` кидає помилку, якщо в `createClient` не передали `novapayPublicKeyPem`. Перевірка без клієнта:

```ts
import { verifyPostbackSignature } from 'novapay';

const ok = verifyPostbackSignature(rawBody, xSign, process.env.NOVAPAY_PUBLIC_KEY_PEM!);
```

Типи payload-ів: `AcquiringPostbackV3` і `CheckoutPostbackV3` (v3, актуальні станом на 2025-10-01).

## API

Кожен метод приймає один об'єкт і повертає проміс.

| Метод | Шлях | Повертає |
|---|---|---|
| `createSession(body)` | `POST /v1/session` | `SessionCreateResponse` |
| `addPayment(body)` | `POST /v1/payment` | `SessionPaymentResponse` |
| `getStatus(body)` | `POST /v1/get-status` | `SessionStatusResponse` |
| `completeHold(body)` | `POST /v1/complete-hold` | `null` |
| `voidSession(body)` | `POST /v1/void` | `null` |
| `expireSession(body)` | `POST /v1/expire` | `null` |

`client.checkout` має ті самі шість методів. `createSession` і `addPayment` ходять на `/v1/checkout/*`, решта — спільні з acquiring.

Дві відмінності checkout, про які варто знати:

- `checkout.addPayment` повертає `CheckoutPaymentResponse` — **`{ url, session_id }` без `id`**. Ідентифікатор транзакції з'являється пізніше в `getStatus`, у `operations[].transaction_id`.
- Сесія checkout стартує зі статусом `precreated`, acquiring — з `created`.

**`completeHold`, `voidSession` і `expireSession` не повертають даних** — тіло відповіді це літеральний `null`. Вони спрацювали, якщо не кинули помилку. Побачити результат можна лише через `getStatus`.

### Життєвий цикл сесії

```
createSession ──▶ created / precreated
                       │
                клієнт оплачує
                       ├── use_hold: true ──▶ holded ──completeHold──▶ paid
                       └── use_hold: false ─────────────────────────▶ paid
                                                                       │
                                                                  voidSession
                                                                       ▼
                                                                     voided
```

`expireSession` переводить неоплачену сесію в `expired`. `voidSession` працює як на звичайному списанні, так і на вже підтвердженому холді.

### `SessionStatusResponse`

```ts
const s = await client.acquiring.getStatus({ merchant_id, session_id });

s.status;              // 'created' | 'precreated' | 'holded' | 'paid' | 'voided' | 'expired'
s.transaction_status;  // 'APPROVED' | 'REFUNDED' | null
s.amount;              // '1.00' — десятковий рядок, не число
s.pan;                 // '424242xxxxxx4242' — маскована, null до оплати
s.paytype;             // 'card'; порожній рядок (не null) до оплати
s.card_type;           // 'VISA'
s.approval_code;       // '1785182032.057'
s.operations;          // [{ transaction_id, external_id, amount, refunded_amount, status }]
```

Три речі, на яких можна обпектися:

- **Суми — десяткові рядки** (`'1.00'`), не числа. Не порівнюйте їх через `===` з числом.
- **`refunded_amount` лишається `null` навіть після успішного void.** Визначайте повернення по `status === 'voided'` або `transaction_status === 'REFUNDED'`.
- **`rrn` лишився `null` навіть на оплаченій сесії**, а `processing_result` до оплати `null`, після — `''`. Жодне з них не є надійним сигналом успіху — орієнтуйтесь на `status`.

`status` і `transaction_status` — відкриті union-и: відомі значення автодоповнюються, нерозпізнані все одно проходять перевірку типів, тож новий статус від NovaPay не зламає вашу збірку.

Типи запитів теж експортуються: `CreateSessionRequest`, `AddPaymentRequest`, `CompleteHoldRequest`, `SessionIdRequest`, `CreateCheckoutSessionRequest`, `AddCheckoutPaymentRequest`.

## Конфігурація

```ts
createClient({
  privateKeyPem,          // обов'язково — приватний RSA-ключ мерчанта, підписує запити
  novapayPublicKeyPem,    // публічний RSA-ключ NovaPay, перевіряє postback-и
  environment,            // NovaPayEnvironment.Test (за замовчуванням) | .Production
  acquiringBaseUrl,       // перевизначає хост (staging, моки)
  checkoutBaseUrl,        // перевизначає хост (staging, моки)
  timeoutMs,              // таймаут на запит, за замовчуванням 30_000
  fetchFn,                // власний fetch — проксі, інструментація, тести
});
```

Acquiring і Checkout використовують спільний хост для кожного середовища:

| `environment` | Константа | Хост |
|---|---|---|
| `NovaPayEnvironment.Test` *(за замовчуванням)* | `TEST_BASE_URL` | `https://api-qecom.novapay.ua` |
| `NovaPayEnvironment.Production` | `PRODUCTION_BASE_URL` | `https://api-ecom.novapay.ua` |

`getExternalApiBaseUrl(env)` віддає хост поза клієнтом.

**Про ключі в змінних середовища:** PEM — багаторядковий. У `.env` або візьміть значення в лапки зі справжніми переносами рядків, або зберігайте у base64 і декодуйте на старті — PEM з літеральними `\n` не розпарситься.

## Помилки

Будь-яка відповідь не-2xx кидає `NovaPayApiError`:

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

| Властивість | Опис |
|---|---|
| `status` | HTTP-код відповіді |
| `responseJson` | Розпарсене тіло, або `undefined` якщо це був не JSON |
| `responseBody` | Сирий текст відповіді |

Тіла 4xx бувають двох форм, розрізняються по `type`:

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

Розгалужуйтесь по `code`, ніколи по тексту `error`. Обидві форми несуть `uuid` — вказуйте його в зверненнях до підтримки. Приводьте тип лише після перевірки, що тіло — об'єкт: 5xx і помилки шлюзу не зобов'язані відповідати жодній із форм.

Таймаут перериває запит і відхиляє проміс з `AbortError`.

**Автоматичних ретраїв немає.** `addPayment` не ідемпотентний — сліпий повтор може списати з клієнта двічі. При таймауті чи 5xx спочатку викличте `getStatus`, щоб дізнатися, що реально сталося.

## Приклад застосунку

Робочий магазин на Express + hbs — кнопки hold і звичайного списання, сторінки success/fail, підписані postback-и та список покупок із `completeHold` / `voidSession`:

```bash
npm run example
```

Налаштування ngrok — у [example/README.md](example/README.md).

## Розробка

```bash
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # biome
npm run build      # tsup → dist/
```

Issues і pull request-и: [github.com/NovaPay/novapay-node](https://github.com/NovaPay/novapay-node/issues).

## Довідник API

Повні списки полів, значення статусів і схеми postback-ів: [NovaPay API Reference](https://novapay.readme.io/reference).

## Ліцензія

[MIT](LICENSE)
