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
import {
  createClient,
  NovaPayApiError,
  NovaPayEnvironment,
  NovaPayProcessingError,
  NovaPayValidationError,
  WEBHOOK_HEADER_X_SIGN,
} from 'novapay';

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

/**
 * QE demo keys. Export them before starting — never hardcode a merchant key in application code.
 * PEM is multi-line: quote the value in .env keeping real newlines, or base64-encode and decode here.
 */
const MERCHANT_PRIVATE_KEY_PEM = process.env.MERCHANT_PRIVATE_KEY_PEM;
const NOVAPAY_PUBLIC_KEY_PEM = process.env.NOVAPAY_PUBLIC_KEY_PEM;

if (!MERCHANT_PRIVATE_KEY_PEM || !NOVAPAY_PUBLIC_KEY_PEM) {
  console.error(
    'Set both keys before running the example:\n' +
      '  export MERCHANT_PRIVATE_KEY_PEM="$(cat merchant-private.pem)"\n' +
      '  export NOVAPAY_PUBLIC_KEY_PEM="$(cat novapay-public.pem)"\n' +
      'QE keys come from NovaPay support (acquiring@novapay.ua).',
  );
  process.exit(1);
}

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
  privateKeyPem: MERCHANT_PRIVATE_KEY_PEM,
  novapayPublicKeyPem: NOVAPAY_PUBLIC_KEY_PEM,
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
    canPay: p.status === 'created',
    paytype: p.callback?.paytype ?? '—',
    pan: p.callback?.card_details?.pan ?? '—',
    rrn: p.callback?.RRN ?? '—',
    callbackJson: p.callback ? JSON.stringify(p.callback, null, 2) : null,
  };
}

/** Human-readable NovaPay error — each class already carries the reason in a typed field. */
function errorText(err) {
  if (err instanceof NovaPayValidationError) {
    return `${err.paths.join(', ')}: ${err.errors[0]?.message ?? 'invalid'}`;
  }
  if (err instanceof NovaPayProcessingError) return err.error || err.code;
  if (err instanceof NovaPayApiError) return err.responseBody || err.message;
  return String(err);
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

  // The signature covers the raw bytes — pass the buffer, never the parsed body.
  let postback;
  try {
    postback = client.parsePostback(req.rawBody, xSign);
  } catch {
    return res.status(401).send('invalid postback signature');
  }

  const purchase = purchases.get(postback.id);
  if (purchase) {
    purchase.status = postback.status ?? 'unknown';
    purchase.callback = postback;
    console.log(`postback: ${postback.id} → ${purchase.status}`);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Landing:  http://127.0.0.1:${PORT}`);
  console.log(`Public:   ${PUBLIC_URL}`);
  console.log(`Postback: ${PUBLIC_URL}/novapay/webhook`);
});
