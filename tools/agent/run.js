#!/usr/bin/env node
// Replays the demo scenario (tools/agent/scenario.json) as the agent: every
// payment attempt goes through the Policy Vault, and the vault decides.
//
//   node agent/run.js --vault C... --identity <cli-identity> [--force] [--phase main|afterPause]
//                     [--evidence ../evidence/agent-demo.md] [--step]
//
// --force sends attempts the simulation rejects anyway (a compromised client),
// so each rejection is enforced on-chain and leaves a FAILED tx hash.

import { parseArgs } from 'node:util';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, getVaultStatus, xlm } from '../lib/stellar.js';
import { VaultWallet, identityAddress } from './wallet.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ERRORS = { 1: 'NotAllowlisted', 2: 'OverTxLimit', 3: 'OverDailyLimit', 4: 'ArithmeticOverflow', 5: 'InvalidAmount', 6: 'InvalidPolicy', 7: 'Paused', 8: 'TooManyPayments', 9: 'NotInitialized',
  // v2 (branch v2-contract)
  10: 'InvalidOwner', 11: 'NoPendingOwner', 12: 'UnderMinAmount', 13: 'InvalidRecovery', 14: 'PolicyOverCeiling' };

const { values: args } = parseArgs({
  options: {
    vault: { type: 'string' },
    identity: { type: 'string' },
    shop: { type: 'string' },
    phase: { type: 'string', default: 'main' },
    scenario: { type: 'string', default: join(HERE, 'scenario.json') },
    evidence: { type: 'string' },
    force: { type: 'boolean', default: false },
    step: { type: 'boolean', default: false },
  },
});

if (!args.vault || !args.identity) {
  console.error('Uso: node agent/run.js --vault <C...> --identity <identidad CLI del agente> [--force] [--phase main|afterPause] [--evidence <archivo.md>] [--step]');
  process.exit(64);
}

const scenario = JSON.parse(readFileSync(args.scenario, 'utf8'));
const steps = args.phase === 'afterPause' ? scenario.afterPause : scenario.steps;
const conn = await connect('testnet');
const status = await getVaultStatus(conn, args.vault);
const address = await identityAddress(args.identity);
if (address !== status.agent) {
  console.error(`✖ La identidad ${args.identity} (${address}) no es el agente de este vault (${status.agent}).`);
  process.exit(65);
}

const book = { shop: args.shop ?? status.policy.allowlist[0], ...scenario.addresses };
const wallet = new VaultWallet(conn, { vaultId: args.vault, identity: args.identity, address });
const prompt = args.step && process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const link = (hash) => `${conn.expertUrl}/tx/${hash}`;

// OPEN_FIRST_REJECTION=1 opens the first on-chain rejection in the default
// browser, so a recording can jump straight to the public proof.
let openedRejection = process.env.OPEN_FIRST_REJECTION !== '1';
function openInBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

if (args.evidence && !existsSync(args.evidence)) {
  appendFileSync(args.evidence, `# CrimsonSentry — demo del agente\n\n- Vault: [\`${args.vault}\`](${conn.expertUrl}/contract/${args.vault})\n- Agente: \`${address}\`\n- Modo: ${args.force ? 'cliente comprometido (envía aunque la simulación rechace)' : 'cliente normal (simula antes de enviar)'}\n\n| Paso | Intento | Resultado | Transacción |\n|---|---|---|---|\n`);
}

console.log(`\n Agente ${address.slice(0, 6)}…  →  vault ${args.vault.slice(0, 6)}…  (${args.force ? 'modo cliente comprometido' : 'modo normal'})`);
for (const s of steps) {
  if (prompt) await prompt.question(`\n[Enter] ${s.title}`);
  else console.log(`\n▶ ${s.title}`);
  console.log(`  Esperado: ${s.expect}`);
  const to = book[s.to] ?? s.to;
  const amount = BigInt(Math.round(s.amount * 1e7));
  for (let i = 1; i <= (s.repeat ?? 1); i++) {
    const label = s.repeat ? `${s.id} ${i}/${s.repeat}` : s.id;
    let r;
    try {
      r = await wallet.pay(to, amount, { force: args.force });
    } catch (err) {
      console.log(`  ✖ ${label}: ${err.message}`);
      continue;
    }
    const err = r.code ? `Error(Contract, #${r.code}) ${ERRORS[r.code] ?? ''}`.trim() : '';
    const text = {
      success: `✅ SUCCESS · ${xlm(amount)} → ${to.slice(0, 6)}…`,
      'failed-onchain': `⛔ FAILED on-chain · ${err}`,
      'rejected-simulation': `🛑 bloqueado en simulación · ${err} (no llega a la red)`,
    }[r.outcome];
    console.log(`  ${text}${r.hash ? `\n     🔗 Ver en Stellar Expert: ${link(r.hash)}` : ''}`);
    if (r.outcome === 'failed-onchain' && !openedRejection) {
      openedRejection = true;
      console.log('     (abriendo esta transacción en el navegador…)');
      openInBrowser(link(r.hash));
    }
    if (args.evidence) {
      const tx = r.hash ? `[\`${r.hash.slice(0, 8)}…\`](${link(r.hash)})` : '—';
      const verdict = {
        success: '✅ SUCCESS',
        'failed-onchain': `⛔ **FAILED on-chain** — \`${err}\``,
        'rejected-simulation': `🛑 bloqueado en simulación — \`${err}\``,
      }[r.outcome];
      appendFileSync(args.evidence, `| ${label} | ${xlm(amount)} → \`${to.slice(0, 6)}…\` | ${verdict} | ${tx} |\n`);
    }
  }
}
prompt?.close();
const after = await getVaultStatus(conn, args.vault);
console.log(`\n Estado del vault: ${xlm(after.balance)} · gastado 24h ${xlm(after.spent_last_24h)} de ${xlm(after.policy.daily_limit)} · ${after.payments_last_24h}/${after.policy.max_payments_per_day} pagos · ${after.paused ? 'EN PAUSA' : 'activo'}\n`);
