// The same payment as e2e.mjs, but through the HOSTED x402 facilitator for Stellar testnet
// (https://channels.openzeppelin.com/x402/testnet) instead of the local copy of its code.
//
//   X402_API_KEY=... node hosted.mjs
//
// A testnet key is free and needs no sign-up: GET https://channels.openzeppelin.com/testnet/gen.
// The key is read from the environment only; it is never written anywhere. Writes
// evidence/agent-account/x402-hosted-evidence.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Asset, Keypair, Networks } from '@stellar/stellar-sdk';
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
const env = Object.fromEntries(readFileSync(join(ROOT, 'evidence', 'agent-account', 'x402-deployment.env'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => l.split('=')));
const ACCOUNT = process.env.ACCOUNT ?? env.ACCOUNT;
const EXPERT = 'https://stellar.expert/explorer/testnet';
const STROOPS = Number(process.env.AMOUNT_STROOPS ?? 80_000_000);

const requirements = {
  scheme: 'exact', network: 'stellar:testnet', asset: Asset.native().contractId(Networks.TESTNET),
  amount: String(STROOPS), payTo: env.SHOP, maxTimeoutSeconds: 60, extra: { areFeesSponsored: true },
};

async function call(path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

const supported = await call('supported');
console.log('supported:', supported.status, JSON.stringify(supported.json).slice(0, 220));

const client = new AgentAccountScheme({ account: ACCOUNT, keypair: Keypair.fromSecret(keys.agent) });
const payload = await client.createPaymentPayload(2, requirements);
const body = {
  x402Version: 2,
  paymentPayload: { ...payload, accepted: requirements, resource: { url: 'https://example.test/premium' } },
  paymentRequirements: requirements,
};

const verify = await call('verify', body);
console.log('verify:', verify.status, JSON.stringify(verify.json));
let settle = null;
if (verify.json?.isValid) {
  settle = await call('settle', body);
  console.log('settle:', settle.status, JSON.stringify(settle.json));
}

const tx = settle?.json?.transaction;
const md = `# x402 en testnet con el facilitador alojado

- Fecha: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
- Facilitador: \`${BASE}\` (público, gratuito en testnet; clave de API sin registro)
- Cuenta pagadora (contrato): [\`${ACCOUNT}\`](${EXPERT}/contract/${ACCOUNT}) · Comercio: \`${env.SHOP}\` · Monto: ${STROOPS / 1e7} XLM
- Cliente: \`tools/agent-account/x402/client.mjs\` (adaptado, firma para cuentas-contrato)

| Paso | Resultado |
|---|---|
| \`GET /supported\` | HTTP ${supported.status}: \`${JSON.stringify(supported.json?.kinds ?? supported.json).slice(0, 200)}\` |
| \`POST /verify\` | HTTP ${verify.status}: ${verify.json?.isValid ? '**válido**' : `**inválido**: \`${verify.json?.invalidReason ?? JSON.stringify(verify.json).slice(0, 160)}\``}${verify.json?.invalidMessage ? ` (${verify.json.invalidMessage})` : ''} |
| \`POST /settle\` | ${settle ? `HTTP ${settle.status}: ${settle.json?.success ? `✅ [\`${tx.slice(0, 8)}…\`](${EXPERT}/tx/${tx})` : `**falló**: \`${JSON.stringify(settle.json).slice(0, 200)}\``}` : '— (no se intentó porque `verify` fue inválido)'} |

Comisión de recursos que calculó la simulación para este pago: ${client.lastCost.minResourceFee.toLocaleString('en-US')} stroops.
`;
writeFileSync(join(ROOT, 'evidence', 'agent-account', 'x402-hosted-evidence.md'), md);
console.log('\nEvidence written to evidence/agent-account/x402-hosted-evidence.md');
