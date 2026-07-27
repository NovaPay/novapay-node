/**
 * NovaPay acquiring demo landing (hbs):
 *  - two buy buttons: hold (use_hold: true) and direct charge
 *  - success / fail pages + signed postback that fills the "recent purchases" list
 *  - completeHold / voidSession from the list, with the real status pulled back via getStatus
 *
 * ngrok: PUBLIC_URL=https://<subdomain>.ngrok-free.app must point at this app.
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createClient, NovaPayApiError, NovaPayEnvironment, WEBHOOK_HEADER_X_SIGN } from 'novapay';

export const DEFAULT_MERCHANT_ID = '2';
export const DEFAULT_CLIENT_PHONE = '+380501112233';

const ITEMS = {
  hold: {
    title: 'Передзамовлення',
    subtitle: 'Кошти блокуються (hold), списуються після підтвердження',
    amount: 10,
    use_hold: true,
  },
  direct: {
    title: 'Купити зараз',
    subtitle: 'Звичайна оплата, кошти списуються одразу',
    amount: 5,
    use_hold: false,
  },
};

const EMBEDDED_MERCHANT_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCgYSuVeKh3Zl8O
sEcOR0MuUcKW6S2+FNOV9R8eJItSoe3U96zOqwNw8DTa2wOKR5W0WPeRQkg2Y2zk
5zFGLSHG1y9+uTDOmO/1kMBzh99P7bvjlE5ofV5+iXH8/Xq9Ye/N+paiAQYN8ym6
N3h9mYHuU9IlksJaCG1RCWjNTxLwoCl0/CJZVawKREAM2XVxWH28HUaeMRTx2Rmk
iQhFGKQJJlyotk9WzkjgqmMJcZHwM8qBRF6ZeBD8hKV3wXWLFcDjKgIMK51IXKbO
335ZdiZdEBbAxg4d9XVe0SR9Z5QgP6+Jw3l5LtCJbZqb9Y2viosJDZGJdTgv4inG
bMm3+HTPAgMBAAECggEAA3rrI259qk5TFnBkVpGRijg92iS3FK9v8z80FiF6hly/
D0S2P/bDN6XRjttkntx7+qzvyOzL/NMWysZyAO0/b1P6LUa7P+2bErJ9p8fmTc8f
izdH8P5lkVs+4MyjFLrZcNRy/YPKDdglMnrpMm6lJfbLrF2FuiE+GGFAmLPsrrOF
/RaRTm2QX+e+tjZhtIBHDMHoPSfcpB2iGMB/Spm/iy3RSWTQYp7ySEu9oaYrTbcG
TxQxOQcwKc7FqbggAyUHEniLsY15BGkJKxGoB4HelnxR+FernJdkNcywdZPzgVFe
lmpltxlP6le4AzSQPVmj+IBrv/h4McWZEUqzFvGWAQKBgQDQ5SW1YvtcEFgT2HCE
2hAxesnLHBEmdwvzkGwmmdwlwIMTxmAELlO8mCQooMbcJAY2O4Kd1tClKKo+SlYl
Aisoc42yGgLsFvauKRl3Fdc+oCadXH3FLhh0PDMJ3XLsZAJ0LM3W1zFeBRJS1Epb
6qqlqrqNqgK14ndnM+Yz5rXn/wKBgQDEi1/ywVtgBNQxp7fSVotX+I44amMfqLq/
yGvo/U37R2sp788yRQ/x0fHDGIXQ4krXymOrEPBQM5mb3VdD1RjfbieSETUwxO+k
Cyx7BopTARcNTo4Nt+vE/KyQeYywGuq9Q/YpkGAlHCRNRKR5mWrsxr8FKGMlel99
j/vinBDzMQKBgF3pVp2IJUbLVj19xYAEZNlJwWSddpxbUrUqDWUBMLaMKKGAQnQ+
u4iCwWa+eQhI7b393QfGpkBJ2tdsJfQ3WF20LVSPWxb2b+n2MiuWVxEhgJqoFSbL
RVUkJzHdK6hYgb3m0pcuYVRKZWV1aQSPqC4YZgwADX3llRaBf5F/u/HTAoGASM5s
Y4uW4rHHPQGpCYS/p33OiT13rKGfVC3VM4Cp43xoSSepdDC7IFQqH6A06dT57oft
ddAXhU4oB+HtUpZc2V9/zw8Kyh8ZuoXdG1Gn6emMdYR1AMXx043aCsbMA+xkqmnD
hVATHYwYMntMBjN7tWxGFI4KdDapquSsZRx09vECgYEAh0fPQPlT7Bbsd50/MDpG
HXwt8v3LFZtxAPLWZdOP7Wmb8DJ5L/yazlVnT1u5y+JfcYGZIEZ/SKLM6I+1xhTN
f8y23MXWUCw00jhLK2clpbjVfWKey2pEcm6aGG3/CMEaOEqspsDS9bE8GdQPfNfw
6VicGagZw45jEQ416jB5d8w=
-----END PRIVATE KEY-----`;

const EMBEDDED_NOVAPAY_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw1FeLVQlCYMnxVMPwhHA
AYik6KGfYz0GJW0SP4dBs6XQ2Ap2kP0X3K5WtJNnPehiWf7jJz9XH2Xh/17t37kZ
KXGEdWYtPUAWQItLGSIwmPMau+YBFFvLD8OReFhFXc6sjReSPJSFV8KDtOP7By9u
+KxYqZTVqPxCeYXHOzT7vtDJBJDLbe0pJ3B3wRihMEuHP54X4zqEAi/vbqArhHDD
O07FZpQ3PA/Fkgj8jMTUxU3LxmIIkNIuLz+Ze/PxL88qvRkRoHd73agYSs5bVdCg
urGUs2hGFQap4KiyR0TRtaJujM715y1gjVFN7Khkkol/dJaHRqxUaZv3dlL+RMXG
/wIDAQAB
-----END PUBLIC KEY-----`;

const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, '');
if (!PUBLIC_URL || !/^https:\/\//i.test(PUBLIC_URL)) {
  console.error(
    'Set PUBLIC_URL to your ngrok HTTPS URL, e.g.\n' +
      '  export PUBLIC_URL="https://<subdomain>.ngrok-free.app"\n' +
      'Run: ngrok http 3000',
  );
  process.exit(1);
}

const client = createClient({
  privateKeyPem: EMBEDDED_MERCHANT_PRIVATE_KEY_PEM,
  novapayPublicKeyPem: EMBEDDED_NOVAPAY_PUBLIC_KEY_PEM,
  environment: NovaPayEnvironment.Test,
});

/** session_id → purchase. ponytail: in-memory, wiped on restart — a demo needs no DB. */
const purchases = new Map();

const findByOrder = (orderId) => [...purchases.values()].find((p) => p.orderId === orderId);

function toView(p) {
  return {
    ...p,
    ...ITEMS[p.mode],
    createdAt: new Date(p.createdAt).toLocaleTimeString('uk-UA'),
    canComplete: p.mode === 'hold' && p.status === 'holded',
    paytype: p.callback?.paytype ?? '—',
    pan: p.callback?.card_details?.pan ?? '—',
    rrn: p.callback?.RRN ?? '—',
    callbackJson: p.callback ? JSON.stringify(p.callback, null, 2) : null,
  };
}

/** Human-readable NovaPay error: the API puts the reason in `error`. */
function errorText(err) {
  return err instanceof NovaPayApiError
    ? (err.responseJson?.error ?? err.responseBody ?? err.message)
    : String(err);
}

/** Pulls the authoritative status — the local copy is only as fresh as the last postback. */
async function syncStatus(purchase) {
  try {
    const status = await client.acquiring.getStatus({
      merchant_id: DEFAULT_MERCHANT_ID,
      session_id: purchase.sessionId,
    });
    purchase.status = status.status ?? purchase.status;
  } catch (err) {
    console.error('getStatus failed:', errorText(err));
  }
}

/** Creates session + payment and returns the pay URL. Every click is a fresh session. */
async function buy(mode) {
  const orderId = randomUUID();
  const item = ITEMS[mode];

  const session = await client.acquiring.createSession({
    merchant_id: DEFAULT_MERCHANT_ID,
    client_phone: DEFAULT_CLIENT_PHONE,
    callback_url: `${PUBLIC_URL}/novapay/webhook`,
    success_url: `${PUBLIC_URL}/success?order=${orderId}`,
    fail_url: `${PUBLIC_URL}/fail?order=${orderId}`,
    metadata: { order_id: orderId },
  });

  const payment = await client.acquiring.addPayment({
    merchant_id: DEFAULT_MERCHANT_ID,
    session_id: session.id,
    amount: item.amount,
    external_id: orderId,
    use_hold: item.use_hold,
    products: [{ description: item.title, count: 1, price: item.amount }],
  });
  if (!payment.url) throw new Error(`No pay URL in response: ${JSON.stringify(payment)}`);

  purchases.set(session.id, {
    orderId,
    sessionId: session.id,
    mode,
    amount: item.amount,
    status: 'created',
    url: payment.url,
    createdAt: Date.now(),
    callback: null,
    error: null,
  });
  return payment.url;
}

const app = express();
app.set('view engine', 'hbs');
app.set('views', new URL('views', import.meta.url).pathname);
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => (req.rawBody = buf) }));

app.get('/', (_req, res) => {
  res.render('index', {
    items: Object.entries(ITEMS).map(([mode, item]) => ({ mode, ...item })),
    purchases: [...purchases.values()].sort((a, b) => b.createdAt - a.createdAt).map(toView),
  });
});

app.post('/buy/:mode', async (req, res, next) => {
  if (!ITEMS[req.params.mode]) return res.status(404).send('unknown item');
  try {
    res.redirect(await buy(req.params.mode));
  } catch (err) {
    next(err);
  }
});

app.post('/hold/:sessionId/:action', async (req, res) => {
  const purchase = purchases.get(req.params.sessionId);
  if (!purchase) return res.status(404).send('unknown session');
  const body = { merchant_id: DEFAULT_MERCHANT_ID, session_id: purchase.sessionId };
  try {
    if (req.params.action === 'complete') {
      await client.acquiring.completeHold({ ...body, amount: purchase.amount });
    } else if (req.params.action === 'void') {
      await client.acquiring.voidSession(body);
    } else {
      return res.status(404).send('unknown action');
    }
    purchase.error = null;
  } catch (err) {
    // The hold may already be completed, voided or expired — show that in the row, don't 500.
    purchase.error = errorText(err);
    console.error(`${req.params.action} failed:`, purchase.error);
  }
  await syncStatus(purchase);
  res.redirect('/');
});

app.get(['/success', '/fail'], (req, res) => {
  const purchase = findByOrder(req.query.order);
  res.render('result', {
    ok: req.path === '/success',
    purchase: purchase && toView(purchase),
  });
});

app.post('/novapay/webhook', (req, res) => {
  const xSign = req.get(WEBHOOK_HEADER_X_SIGN);
  if (!xSign) return res.status(400).send(`missing ${WEBHOOK_HEADER_X_SIGN}`);
  if (!client.verifyPostback(req.rawBody, xSign)) {
    return res.status(401).send('invalid postback signature');
  }

  const purchase = purchases.get(req.body.id);
  if (purchase) {
    purchase.status = req.body.status ?? 'unknown';
    purchase.callback = req.body;
    console.log(`postback: ${req.body.id} → ${purchase.status}`);
  }
  res.status(200).send('OK');
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res
    .status(500)
    .type('text')
    .send(`NovaPay error: ${errorText(err)}`);
});

app.listen(3000, () => {
  console.log(`Landing:  http://127.0.0.1:3000`);
  console.log(`Public:   ${PUBLIC_URL}`);
  console.log(`Postback: ${PUBLIC_URL}/novapay/webhook`);
});
