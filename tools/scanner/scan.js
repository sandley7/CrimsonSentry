#!/usr/bin/env node
// CrimsonSentry scanner: audits an AI agent's wallet setup around a Policy
// Vault and prints a traffic light mapped to the OWASP Agentic Top 10 (2026).
//
//   node scanner/scan.js --vault C... [--agent G...] [--expected-wasm <sha256>] [--json]
//
// Read-only: it simulates get_status() through Stellar RPC and reads accounts
// from Horizon. No keys, no transactions. Exit code: 0 green, 1 yellow, 2 red.

import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  connect, getVaultStatus, getContractInfo, getAccount, getActivity,
  getBaseReserve, nativeSacId, xlm, STROOPS_PER_XLM,
} from '../lib/stellar.js';
import { runChecks, verdict } from './checks.js';
import { ASI, NOT_OBSERVABLE } from './owasp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_WASM_FILE = process.env.EXPECTED_WASM_FILE
  ? resolve(ROOT, process.env.EXPECTED_WASM_FILE)
  : join(ROOT, 'evidence', 'wasm-sha256.txt');
const LIGHT = { green: '🟢', yellow: '🟡', red: '🔴' };
const EXIT = { green: 0, yellow: 1, red: 2 };

const { values: args } = parseArgs({
  options: {
    vault: { type: 'string' },
    agent: { type: 'string' },
    network: { type: 'string', default: 'testnet' },
    'expected-wasm': { type: 'string' },
    'fee-buffer': { type: 'string', default: '2' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help || !args.vault) {
  console.log(`Uso: node scanner/scan.js --vault <C...> [--agent <G...>] [--expected-wasm <sha256>] [--fee-buffer <XLM>] [--json]

  --vault          Contrato Policy Vault a auditar (obligatorio)
  --agent          Cuenta del agente (por defecto, la que registra el vault)
  --expected-wasm  sha256 del build auditado (por defecto: evidence/wasm-sha256.txt)
  --fee-buffer     XLM que se considera razonable que el agente guarde para fees (2)
  --json           Salida en JSON (para el dashboard o CI)

Código de salida: 0 verde · 1 amarillo · 2 rojo`);
  process.exit(args.help ? 0 : 64);
}

const feeBufferXlm = Number(args['fee-buffer']);
if (!Number.isFinite(feeBufferXlm) || feeBufferXlm < 0) {
  console.error(`✖ --fee-buffer debe ser un número de XLM ≥ 0 (recibido: "${args['fee-buffer']}").`);
  process.exit(64);
}

async function collect(conn) {
  const status = await getVaultStatus(conn, args.vault);
  const agentId = args.agent ?? status.agent;
  if (agentId !== status.agent) {
    console.error(`⚠ --agent (${agentId}) no es el agente que registra el vault (${status.agent}); se audita el del vault.`);
  }
  const [contractInfo, baseReserve, agentAccount, ownerAccount, agentActivity] = await Promise.all([
    getContractInfo(conn, args.vault),
    getBaseReserve(conn),
    getAccount(conn, status.agent),
    getAccount(conn, status.owner),
    getActivity(conn, status.agent),
  ]);
  const allowlistAccounts = {};
  await Promise.all(status.policy.allowlist.filter((a) => a.startsWith('G')).map(async (a) => {
    allowlistAccounts[a] = (await getAccount(conn, a)) !== null;
  }));
  const recoveryAccount = status.recovery?.startsWith('G') ? await getAccount(conn, status.recovery) : undefined;
  const expectedWasm = args['expected-wasm']
    ?? (existsSync(DEFAULT_WASM_FILE) ? readFileSync(DEFAULT_WASM_FILE, 'utf8').trim() : null);
  const feeBuffer = BigInt(Math.round(feeBufferXlm * Number(STROOPS_PER_XLM)));
  return {
    status, contractInfo, baseReserve, agentAccount, ownerAccount, agentActivity,
    allowlistAccounts, recoveryAccount, expectedWasm, feeBuffer, nativeSac: nativeSacId(conn), now: Date.now(),
  };
}

function printReport(conn, data, results, overall) {
  const s = data.status;
  const line = '─'.repeat(78);
  console.log(`\n CrimsonSentry · escáner de seguridad del agente   (red: ${conn.name})`);
  console.log(line);
  console.log(` Vault   ${args.vault}`);
  console.log(`         ${conn.expertUrl}/contract/${args.vault}`);
  console.log(` Agente  ${s.agent}`);
  console.log(` Dueño   ${s.owner}`);
  console.log(` Saldo del vault ${xlm(s.balance)} · ${s.paused ? 'EN PAUSA' : 'activo'}`);
  console.log(line);
  for (const r of results) {
    const asi = r.asi.length ? `  [${r.asi.join(' ')}]` : '';
    console.log(` ${LIGHT[r.color]} ${r.id.padEnd(4)} ${r.title}${asi}`);
    console.log(`         ${r.detail}`);
    if (r.color !== 'green' && r.fix) console.log(`         → ${r.fix}`);
  }
  console.log(line);
  const counts = results.reduce((acc, r) => ({ ...acc, [r.color]: (acc[r.color] ?? 0) + 1 }), {});
  const verdictText = { green: 'SIN RIESGOS DETECTADOS', yellow: 'REVISAR LOS PUNTOS EN AMARILLO', red: 'RIESGO: HAY PUNTOS EN ROJO' }[overall];
  console.log(` Veredicto: ${LIGHT[overall]} ${verdictText}   (🔴 ${counts.red ?? 0} · 🟡 ${counts.yellow ?? 0} · 🟢 ${counts.green ?? 0})`);

  const flagged = new Set(results.filter((r) => r.color !== 'green').flatMap((r) => r.asi));
  if (flagged.size) {
    console.log(`\n OWASP Agentic Top 10 (2026) con hallazgos:`);
    for (const id of [...flagged].sort()) console.log(`   ${id} ${ASI[id]}`);
  }
  console.log(`\n No observables on-chain:`);
  for (const [id, why] of Object.entries(NOT_OBSERVABLE)) console.log(`   ${id} ${ASI[id]}: ${why}`);
  console.log('');
}

function toJson(data, results, overall) {
  return JSON.stringify(
    { vault: args.vault, network: args.network, verdict: overall, status: data.status, contract: data.contractInfo, checks: results },
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
}

try {
  const conn = await connect(args.network);
  const data = await collect(conn);
  const results = runChecks(data);
  const overall = verdict(results);
  if (args.json) console.log(toJson(data, results, overall));
  else printReport(conn, data, results, overall);
  process.exit(EXIT[overall]);
} catch (err) {
  console.error(`✖ No se pudo completar el escaneo: ${err.message}`);
  process.exit(70);
}
