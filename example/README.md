# Приклад `novapay` (QE)

Контракт API: [NovaPay API Reference](https://novapay.readme.io/reference).

## Запуск з кореня репозиторію

```bash
ngrok http 3000
export PUBLIC_CALLBACK_URL="https://<subdomain>.ngrok-free.app"
export NOVAPAY_ACTION=void
npm run example
```

`NOVAPAY_ACTION`: **`complete`** (зняти hold → `completeHold`) або **`void`** (`voidSession`) — **обов’язково**.

## Змінні середовища

| Змінна | Обов’язкова | Опис |
|--------|-------------|------|
| `PUBLIC_CALLBACK_URL` | **Так** | Публічний HTTPS URL postback (ngrok + path), збігається з `POST` у Express |
| `NOVAPAY_ACTION` | **Так** | `complete` або `void` |

Залежність: **express** (див. [`package.json`](package.json)).
