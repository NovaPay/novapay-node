# Приклад `novapay` (QE)

Лендінг-магазин на Express + hbs: дві кнопки покупки (hold і звичайне списання), сторінки успіху/невдачі
та список останніх покупок зі статусом із postback.

Контракт API: [NovaPay API Reference](https://novapay.readme.io/reference).

## Запуск з кореня репозиторію

```bash
ngrok http 3000
export PUBLIC_URL="https://<subdomain>.ngrok-free.app"
export NOVAPAY_PRIVATE_KEY_PEM="$(cat merchant-private.pem)"
export NOVAPAY_PUBLIC_KEY_PEM="$(cat novapay-public.pem)"
npm run example
```

QE-ключі видає підтримка NovaPay (acquiring@novapay.ua). Ключі **не** зберігаються в репозиторії:
приватний ключ мерчанта ніколи не потрапляє в код застосунку.

Далі відкрити http://127.0.0.1:3000.

## Що робить

| Маршрут | Опис |
|---------|------|
| `GET /` | Лендінг: дві кнопки + секція «Останні покупки» |
| `POST /buy/:mode` | `createSession` + `addPayment` (`hold` → `use_hold: true`), редірект на сторінку оплати — кожен клік створює нову сесію |
| `POST /hold/:sessionId/:action` | `completeHold` або `voidSession`, далі `getStatus` для справжнього статусу; помилка API показується в рядку покупки |
| `GET /success` `GET /fail` | `success_url` / `fail_url`, показують статус і payload postback |
| `POST /novapay/webhook` | Перевірка `x-sign-v2` по **сирому** тілу, оновлення статусу покупки |

Стан тримається в пам'яті — після рестарту список порожній.

## Змінні середовища

| Змінна | Обов'язкова | Опис |
|--------|-------------|------|
| `PUBLIC_URL` | **Так** | Публічний HTTPS URL застосунку (ngrok), від нього будуються `callback_url`, `success_url`, `fail_url` |
| `NOVAPAY_PRIVATE_KEY_PEM` | **Так** | Приватний RSA-ключ мерчанта (QE), підписує вихідні запити |
| `NOVAPAY_PUBLIC_KEY_PEM` | **Так** | Публічний RSA-ключ NovaPay, перевіряє підпис postback'ів |

Залежності: **express**, **hbs** (див. [`package.json`](package.json)).
