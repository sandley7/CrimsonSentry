// x402 end to end on Stellar testnet, paying from a CrimsonSentry agent account.
//
//   cd tools/agent-account/x402 && npm install
//   node e2e.mjs                      # ACCOUNT=C... to use another account
//
// What runs:
//   * client  : AgentAccountScheme (client.mjs), a copy of the official client that can sign for a contract account
//   * facilitator: ExactStellarScheme from @x402/stellar/exact/facilitator, unmodified, running locally with the
//                  relayer as its signer (it pays the fees and spends the sequence number, as a real facilitator does)
// It does NOT use the hosted facilitator service or an HTTP resource server.
//
// Uses throwaway testnet keys from ../.keys.json (git-ignored). Writes evidence/agent-account/x402-evidence.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Asset, Keypair, Networks, rpc, TransactionBuilder, Address, Contract, nativeToScVal } from '@stellar/stellar-sdk';
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme as OfficialClient } from '@x402/stellar/exact/client';
import { ExactStellarScheme as Facilitator } from '@x402/stellar/exact/facilitator';
import { AgentAccountScheme } from './client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const keys = JSON.parse(readFileSync(join(HERE, '..', '.keys.json'), 'utf8'));
const env = Object.fromEntries(readFileSync(join(ROOT, 'evidence', 'agent-account', 'x402-deployment.env'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => l.split('=')));

const NETWORK = 'stellar:testnet';
const ACCOUNT = process.env.ACCOUNT ?? env.ACCOUNT;
const SHOP = env.SHOP;
const XLM = Asset.native().contractId(Networks.TESTNET);
const EXPERT = 'https://stellar.expert/explorer/testnet';
const agent = Keypair.fromSecret(keys.agent);
const owner = Keypair.fromSecret(keys.owner);
const relayer = createEd25519Signer(keys.relayer, NETWORK);
const resource = { url: 'https://example.test/premium' };
const note = (s) => { console.log(s); };

const requirements = (stroops) => ({
  scheme: 'exact', network: NETWORK, asset: XLM, amount: String(stroops), payTo: SHOP,
  maxTimeoutSeconds: 60, extra: { areFeesSponsored: true },
});
const short = (e) => String(e?.message ?? e).replace(/\s+/g, ' ');
const contractCode = (e) => /Error\(Contract, #(\d+)\)/.exec(String(e?.message ?? e))?.[1] ?? null;

// ---------------------------------------------------------------------------
// 0. The official client cannot sign for a contract address
// ---------------------------------------------------------------------------
note('0. official client with a classic signer for a contract address');
let officialError;
try {
  const classic = { ...createEd25519Signer(keys.agent, NETWORK), address: ACCOUNT };
  await new OfficialClient(classic).createPaymentPayload(2, requirements(10_000_000));
  officialError = '(unexpected: it built a payload)';
} catch (e) {
  officialError = short(e);
}
note(`   -> ${officialError}`);

// ---------------------------------------------------------------------------
// 1-2. The account pays through the official facilitator
// ---------------------------------------------------------------------------
const client = new AgentAccountScheme({ account: ACCOUNT, keypair: agent });
const strict = new Facilitator([relayer]); // default fee ceiling: 50_000 stroops
const lenient = new Facilitator([relayer], { maxTransactionFeeStroops: 2_000_000 });
const verifyArg = (payload, req) => [{ ...payload, accepted: req, resource }, req];

note('1. valid payment of 8 XLM, facilitator with its default fee ceiling');
const req8 = requirements(80_000_000);
const payload1 = await client.createPaymentPayload(2, req8);
const verifyStrict = await strict.verify(...verifyArg(payload1, req8));
note(`   -> ${JSON.stringify(verifyStrict)}`);

note('2. the same payment, fee ceiling raised to 2,000,000 stroops');
const payload2 = await client.createPaymentPayload(2, req8);
const cost2 = client.lastCost;
const verifyOk = await lenient.verify(...verifyArg(payload2, req8));
note(`   -> verify ${JSON.stringify(verifyOk)}`);
let settled = null;
if (verifyOk.isValid) {
  settled = await lenient.settle(...verifyArg(payload2, req8));
  note(`   -> settle ${JSON.stringify(settled)}`);
}

// ---------------------------------------------------------------------------
// 3. Out-of-policy payments are refused when the account is asked to authorize them
// ---------------------------------------------------------------------------
async function refused(label, keypair, kind, stroops) {
  try {
    await new AgentAccountScheme({ account: ACCOUNT, keypair, kind }).createPaymentPayload(2, requirements(stroops));
    return { label, outcome: 'built a payload (unexpected)' };
  } catch (e) {
    return { label, outcome: `refused by the account${contractCode(e) ? ` (#${contractCode(e)})` : ''}` };
  }
}
note('3. out-of-policy payments');
const refusals = [
  await refused('15 XLM, above the per-payment limit of 10 XLM', agent, 'Agent', 150_000_000),
  await refused('the owner key paying the shop instead of the recovery address', owner, 'Owner', 10_000_000),
];
refusals.forEach((r) => note(`   -> ${r.label}: ${r.outcome}`));

// ---------------------------------------------------------------------------
// Cost of a classic account transfer, for comparison
// ---------------------------------------------------------------------------
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const relayerKp = Keypair.fromSecret(keys.relayer);
const src = await server.getAccount(relayerKp.publicKey());
const classicTx = new TransactionBuilder(src, { fee: '10000000', networkPassphrase: Networks.TESTNET })
  .addOperation(new Contract(XLM).call('transfer', new Address(relayerKp.publicKey()).toScVal(), new Address(SHOP).toScVal(), nativeToScVal(80_000_000n, { type: 'i128' })))
  .setTimeout(300).build();
const classicFee = Number((await server.simulateTransaction(classicTx)).minResourceFee);

// ---------------------------------------------------------------------------
// Evidence file
// ---------------------------------------------------------------------------
const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
const md = `# x402 en testnet: pago desde una cuenta-contrato

- Fecha: ${date} UTC
- Cuenta pagadora (contrato): [\`${ACCOUNT}\`](${EXPERT}/contract/${ACCOUNT})
- Comercio (\`payTo\`): \`${SHOP}\` · Facilitador: ${relayer.address.slice(0, 8)}…${relayer.address.slice(-6)} (el relayer)
- **Cliente:** \`tools/agent-account/x402/client.mjs\`, una copia del cliente oficial de \`@x402/stellar\` que firma para una cuenta-contrato.
- **Facilitador:** \`ExactStellarScheme\` de \`@x402/stellar/exact/facilitator\` 2.20, **sin modificar**, ejecutado en local con el relayer como firmante.
- No se usó el servicio de facilitador alojado ni un servidor HTTP de recursos.

| Paso | Resultado |
|---|---|
| El cliente **oficial** con una dirección de contrato | Falla: \`${officialError}\` |
| Pago de 8 XLM, facilitador con su tope de comisión por defecto (50 000 stroops) | \`verify\`: **${verifyStrict.isValid ? 'válido' : 'inválido'}**${verifyStrict.isValid ? '' : ` (\`${verifyStrict.invalidReason}\`: ${verifyStrict.invalidMessage})`} |
| El mismo pago, tope subido a 2 000 000 de stroops | \`verify\`: **${verifyOk.isValid ? 'válido' : 'inválido'}**${verifyOk.isValid ? ' (pagador: la cuenta-contrato)' : ''} |
| \`settle\` | ${settled?.success ? `✅ [\`${settled.transaction.slice(0, 8)}…\`](${EXPERT}/tx/${settled.transaction})` : '—'} |
${refusals.map((r) => `| ${r.label} | ${r.outcome} |`).join('\n')}

## Costo

| Pago | Comisión de recursos (simulación) |
|---|---|
| Transferencia clásica desde una cuenta G | ${classicFee.toLocaleString('en-US')} stroops |
| Desde la cuenta-contrato, régimen normal | ${cost2.minResourceFee.toLocaleString('en-US')} stroops (${(cost2.instructions / 1e6).toFixed(1)} M de instrucciones) |

La primera vez que una cuenta paga, además crea su registro de gastos persistente: en la primera ejecución de esta prueba se midieron **646 843 stroops**.

El tope por defecto del facilitador (50 000 stroops, 0,005 XLM) rechaza el pago desde la cuenta-contrato. Es una configuración del facilitador, pero implica que **quien opere el facilitador tiene que aceptar comisiones mucho mayores**, y en pagos pequeños la comisión puede superar el monto.

## Lo que esta prueba no demuestra

- Que funcione con el facilitador alojado (OpenZeppelin Channels u otro), que puede imponer otras reglas.
- Un flujo HTTP completo (402, reintento con cabecera, 200): aquí se prueba la parte específica de Stellar, el pago, su verificación y su liquidación.
- Pagos en USDC: se usó el XLM nativo (un token SEP-41) para no depender de la trustline del comercio.
- Que las wallets sepan firmar para esta cuenta.
`;
writeFileSync(join(ROOT, 'evidence', 'agent-account', 'x402-evidence.md'), md);
note(`\nEvidence written to evidence/agent-account/x402-evidence.md`);
