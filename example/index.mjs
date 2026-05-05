/**
 * Acquiring hold: Express POST endpoint for postback → verify x-sign → voidSession or completeHold.
 * Action from env: NOVAPAY_ACTION=complete | void
 *
 * ngrok: PUBLIC_CALLBACK_URL=https://<subdomain>.ngrok-free.app must match this app’s path.
 */
import express from 'express';
import { createClient, NovaPayApiError, NovaPayEnvironment, WEBHOOK_HEADER_X_SIGN } from 'novapay';

export const DEFAULT_MERCHANT_ID = '2';
export const DEFAULT_CLIENT_PHONE = '+380501112233';
export const DEFAULT_CALLBACK_URL = 'https://example.com/novapay-example/cb';

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

const ACTION = process.env.NOVAPAY_ACTION?.trim().toLowerCase();
if (ACTION !== 'complete' && ACTION !== 'void') {
  console.error('Set NOVAPAY_ACTION to "complete" or "void".');
  process.exit(1);
}

const PUBLIC_CALLBACK_URL = process.env.PUBLIC_CALLBACK_URL;
if (!PUBLIC_CALLBACK_URL || !/^https:\/\//i.test(PUBLIC_CALLBACK_URL)) {
  console.error(
    'Set PUBLIC_CALLBACK_URL to your ngrok HTTPS URL, e.g.\n' +
      '  export PUBLIC_CALLBACK_URL="https://<subdomain>.ngrok-free.app"\n' +
      'Run: ngrok http 3000',
  );
  process.exit(1);
}

const knownSessionIds = new Set();

async function main() {
  const client = createClient({
    privateKeyPem: EMBEDDED_MERCHANT_PRIVATE_KEY_PEM,
    novapayPublicKeyPem: EMBEDDED_NOVAPAY_PUBLIC_KEY_PEM,
    environment: NovaPayEnvironment.Test,
  });

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/novapay/webhook', async (req, res) => {
    try {
      const xSign = req.get(WEBHOOK_HEADER_X_SIGN);
      if (!xSign) {
        res.status(400).send(`missing ${WEBHOOK_HEADER_X_SIGN}`);
        return;
      }
      if (!client.verifyPostback(JSON.stringify(req.body), xSign)) {
        res.status(401).send('invalid postback signature');
        return;
      }
      if (!knownSessionIds.has(req.body.id)) {
        res.status(200).send('OK');
        return;
      }

      if (ACTION === 'void') {
        await client.acquiring.voidSession({
          merchant_id: DEFAULT_MERCHANT_ID,
          session_id: req.body.id,
        });
        console.log('voidSession: OK');
      } else if (ACTION === 'complete') {
        await client.acquiring.completeHold({
          merchant_id: DEFAULT_MERCHANT_ID,
          session_id: req.body.id,
          amount: 10,
        });
        console.log('completeHold: OK');
      }

      knownSessionIds.delete(req.body.id);
      res.status(200).send('OK');
    } catch (err) {
      console.error(err);
      try {
        res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
      } catch {
        /* ignore */
      }
    }
  });

  app.use((_req, res) => {
    res.status(404).end();
  });

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(3000, () => resolve(s));
    s.on('error', reject);
  });

  console.log('\n--- Express postback ---');
  console.log(`POST /novapay/webhook`);
  console.log(`Local:  http://127.0.0.1:3000/novapay/webhook`);
  console.log(`Public (callback_url): ${PUBLIC_CALLBACK_URL}/novapay/webhook`);
  console.log(`NOVAPAY_ACTION: ${ACTION}`);

  console.log('--- Create session (acquiring) ---');
  const session = await client.acquiring.createSession({
    merchant_id: DEFAULT_MERCHANT_ID,
    client_phone: DEFAULT_CLIENT_PHONE,
    callback_url: `${PUBLIC_CALLBACK_URL}/novapay/webhook`,
  });

  console.log('session_id:', session.id);

  console.log('\n--- Add payment (hold, use_hold: true) ---');
  const payment = await client.acquiring.addPayment({
    merchant_id: DEFAULT_MERCHANT_ID,
    session_id: session.id,
    amount: 10,
    use_hold: true,
  });
  if (!payment.url) {
    console.error('No pay URL in response:', payment);
    server.close();
    process.exit(1);
  }

  knownSessionIds.add(session.id);

  console.log('Pay URL:', payment.url);
  console.log('\nWaiting for signed postback…\n');
}

try {
  await main();
} catch (err) {
  if (err instanceof NovaPayApiError) {
    console.error('NovaPay API error:', err.message, 'status=', err.status);
    console.error('Body:', err.responseBody);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
}
