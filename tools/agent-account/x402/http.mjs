// A complete x402 HTTP flow on Stellar testnet, paid by a CrimsonSentry agent account:
//
//   agent --GET /premium--> resource server --402 + requirements--> agent
//   agent signs the payment with the ACCOUNT (a contract) and retries with the payment header
//   resource server --/verify, /settle--> HOSTED facilitator (pays the fees) --> 200 + the data
//
//   X402_API_KEY=... node http.mjs        # a free testnet key: GET https://channels.openzeppelin.com/testnet/gen
//
// The server uses @x402/express and the client @x402/fetch, both official; the only custom piece is
// AgentAccountScheme, which signs for a contract account. The key is read from the environment only.
// Writes evidence/agent-account/x402-http-evidence.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import { Asset, Keypair, Networks } from '@stellar/stellar-sdk';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactStellarScheme as ServerScheme } from '@x402/stellar/exact/server';
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from '@x402/fetch';
import { AgentAccountScheme } from './client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const BASE = process.env.X402_FACILITATOR ?? 'https://channels.openzeppelin.com/x402/testnet';
const KEY = process.env.X402_API_KEY;
if (!KEY) {
  console.error('Falta X402_API_KEY (una clave gratuita de testnet: GET https://channels.openzeppelin.com/testnet/gen).');
  process.exit(64);
}

const keys = JSON.parse(readFileSync(join(HERE, '..', '.keys.json'), 'utf8'));
const deployment = process.env.DEPLOYMENT ?? 'x402-deployment.env';
const env = Object.fromEntries(readFileSync(join(ROOT, 'evidence', 'agent-account', deployment), 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => l.split('=')));
const ACCOUNT = process.env.ACCOUNT ?? env.ACCOUNT;
const XLM = Asset.native().contractId(Networks.TESTNET);
const EXPERT = 'https://stellar.expert/explorer/testnet';
const NETWORK = 'stellar:testnet';

// --- resource server: one cheap route (1 XLM) and one above the account's per-payment limit (15 XLM) ----
const facilitator = new HTTPFacilitatorClient({
  url: BASE,
  createAuthHeaders: async () => {
    const h = { Authorization: `Bearer ${KEY}` };
    return { verify: h, settle: h, supported: h };
  },
});
const resourceServer = new x402ResourceServer(facilitator).register(NETWORK, new ServerScheme());
const route = (xlmStroops, description) => ({
  accepts: { scheme: 'exact', network: NETWORK, payTo: env.SHOP, price: { amount: String(xlmStroops), asset: XLM }, maxTimeoutSeconds: 60 },
  description,
});

const app = express();
app.use(paymentMiddleware({
  'GET /premium': route(10_000_000, 'Dato premium'),
  'GET /premium-caro': route(150_000_000, 'Dato premium caro'),
}, resourceServer));
app.get('/free', (_req, res) => res.json({ message: 'gratis' }));
app.get('/premium', (_req, res) => res.json({ message: 'contenido de pago entregado', price: '1 XLM' }));
app.get('/premium-caro', (_req, res) => res.json({ message: 'no debería llegar' }));

const listener = await new Promise((resolve) => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
const url = `http://127.0.0.1:${listener.address().port}`;
const rows = [];
const say = (s) => console.log(s);

try {
  // 1. without paying
  const plain = await fetch(`${url}/premium`);
  const req402 = plain.status === 402 ? JSON.parse(Buffer.from(plain.headers.get('payment-required') ?? '', 'base64').toString() || '{}') : null;
  const accepted = req402?.accepts?.[0] ?? req402?.accepts ?? null;
  say(`1. GET /premium sin pagar -> HTTP ${plain.status}`);
  rows.push(`| \`GET /premium\` sin pagar | HTTP **${plain.status}** Payment Required${accepted ? ` (pide ${Number(accepted.amount) / 1e7} XLM a \`${accepted.payTo?.slice(0, 8)}…\` en \`${accepted.network}\`)` : ''} |`);

  // 2. the agent pays from its account
  const client = new AgentAccountScheme({ account: ACCOUNT, keypair: Keypair.fromSecret(keys.agent) });
  // @x402/fetch also has client-side spend controls: by default only USDC, at most $1 per payment.
  // They are off-chain, so a compromised client could skip them; here XLM is allowed with a cap above the
  // account's own limit, so that the limit exercised in step 3 is the one the contract enforces on-chain.
  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK, client }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: XLM, maxAmountPerPayment: '200000000' }] },
  });
  const paid = await fetchWithPayment(`${url}/premium`);
  const body = await paid.json().catch(() => null);
  const header = paid.headers.get('payment-response');
  const settlement = header ? decodePaymentResponseHeader(header) : null;
  say(`2. GET /premium pagando desde la cuenta -> HTTP ${paid.status} ${JSON.stringify(body)}`);
  say(`   liquidación: ${JSON.stringify(settlement)}`);
  const tx = settlement?.transaction;
  rows.push(`| \`GET /premium\` pagando desde la cuenta-contrato | HTTP **${paid.status}**, cuerpo \`${JSON.stringify(body)}\`${tx ? `, liquidado en [\`${tx.slice(0, 8)}…\`](${EXPERT}/tx/${tx})` : ''}${settlement?.payer ? `, pagador \`${settlement.payer.slice(0, 8)}…\`` : ''} |`);

  // 3. a payment the account's policy refuses
  let refusal;
  try {
    const r = await fetchWithPayment(`${url}/premium-caro`);
    refusal = `HTTP ${r.status} (inesperado)`;
  } catch (e) {
    const m = String(e?.message ?? e);
    const code = /Error\(Contract, #(\d+)\)/.exec(m)?.[1];
    refusal = `el agente no pudo pagar: la cuenta rechazó la autorización${code ? ` (#${code})` : ''}; no se envió nada a la red`;
  }
  say(`3. GET /premium-caro (15 XLM) -> ${refusal}`);
  rows.push(`| \`GET /premium-caro\` (15 XLM, por encima del límite por pago) | ${refusal} |`);

  const free = await fetch(`${url}/free`);
  rows.push(`| \`GET /free\` (sin cobro) | HTTP ${free.status} |`);

  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  writeFileSync(join(ROOT, 'evidence', 'agent-account', 'x402-http-evidence.md'), `# x402 de punta a punta por HTTP: un agente paga una API desde su cuenta-contrato

- Fecha: ${date} UTC
- Cuenta del agente (contrato): [\`${ACCOUNT}\`](${EXPERT}/contract/${ACCOUNT})
- **Servidor de recursos:** Express con \`@x402/express\` (oficial) y el esquema de servidor \`@x402/stellar\` 2.28, cobrando en XLM nativo (un token SEP-41).
- **Cliente:** \`fetch\` envuelto con \`@x402/fetch\` (oficial) y \`AgentAccountScheme\` (\`client.mjs\`), que firma para una cuenta-contrato.
- **Facilitador:** el alojado de testnet, \`${BASE}\`, que verifica, liquida y paga las comisiones.

| Petición | Resultado |
|---|---|
${rows.join('\n')}

## Lo que esta prueba no demuestra

- Pagos en USDC, ni un servidor en producción.
- Que las wallets sepan firmar para esta cuenta.
- Que el costo en comisiones (unas 25 veces el de una transferencia clásica) sea aceptable para pagos pequeños. Ver [\`docs/ARQUITECTURA-B.md\`](../../docs/ARQUITECTURA-B.md).
`);
  say('\nEvidence written to evidence/agent-account/x402-http-evidence.md');
} finally {
  listener.close();
}
