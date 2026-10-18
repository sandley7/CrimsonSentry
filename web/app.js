// CrimsonSentry public demo. Everything runs in the browser against Stellar
// testnet: it reads the vault by RPC and simulates calls. It never asks for,
// holds or sends a key, and it never submits a transaction.

import {
  Address, BASE_FEE, Contract, TransactionBuilder, nativeToScVal, rpc, xdr,
} from '@stellar/stellar-sdk';
import {
  connect, getVaultStatus, getContractInfo, getBaseReserve, getAccount, getActivity,
  nativeSacId, xlm, toStroops, STROOPS_PER_XLM,
} from './tools/lib/stellar.js';
import { runChecks, verdict } from './tools/scanner/checks.js';
import { ASI } from './tools/scanner/owasp.js';

const FALLBACK_VAULT = 'CCGYAPPA7BUFILV77KK6IZZANCEB7Q5KYIOT2T263CHZZRNFVV7REVZC';
const STRANGER = 'GAMV2LI3GDTTOBOSYEOVTRBKG4ZGQAUV4HBIX3KHWH547PCR3WZQV4AO';

const ERRORS = {
  1: ['NotAllowlisted', 'El destino no está en la allowlist: el agente solo puede pagar a las direcciones que el dueño autorizó.'],
  2: ['OverTxLimit', 'El pago supera el límite por transacción.'],
  3: ['OverDailyLimit', 'Con este pago se superaría el límite acumulado de las últimas 24 horas móviles.'],
  4: ['ArithmeticOverflow', 'Desbordamiento aritmético en la suma del gasto.'],
  5: ['InvalidAmount', 'El monto debe ser mayor que cero.'],
  6: ['InvalidPolicy', 'La política es incoherente (por ejemplo, el límite por pago supera el límite diario).'],
  7: ['Paused', 'El vault está en pausa: el dueño activó el kill switch.'],
  8: ['TooManyPayments', 'Ya se alcanzó el máximo de pagos en 24 horas.'],
  9: ['NotInitialized', 'El vault no está inicializado.'],
  10: ['InvalidOwner', 'Ese dueño no es válido (igual al actual, al agente, a la recuperación o a un destino permitido).'],
  11: ['NoPendingOwner', 'No hay un cambio de dueño pendiente.'],
  12: ['UnderMinAmount', 'El pago está por debajo del monto mínimo: así agotar la cuota con micropagos tiene un costo.'],
  13: ['InvalidRecovery', 'La dirección de recuperación no es válida.'],
  14: ['PolicyOverCeiling', 'La política supera los techos inmutables fijados al desplegar: ni el dueño puede aflojarla más allá.'],
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => `${a.slice(0, 6)}…${a.slice(-6)}`;

let conn = null;
let vaultId = null;
let status = null;
const latest = { pay: 0, policy: 0, scan: 0 }; // only the newest answer is drawn

// ---------------------------------------------------------------------------
// 1. The vault, live
// ---------------------------------------------------------------------------

let vaults = { showcase: FALLBACK_VAULT, official: FALLBACK_VAULT };

async function defaultVault() {
  const fromUrl = new URLSearchParams(location.search).get('vault');
  try {
    vaults = await (await fetch('./vault.json', { cache: 'no-store' })).json();
  } catch {
    /* keep the fallback */
  }
  return fromUrl ? fromUrl.trim() : vaults.showcase;
}

function row(label, value) {
  return `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;
}

function renderStatus(s, id) {
  const p = s.policy;
  const addr = (a) => `<code title="${esc(a)}">${esc(short(a))}</code>`;
  $('status').className = '';
  $('status').innerHTML = `
    <div class="grid">
      <table>
        ${row('Estado', s.paused ? '<span class="pill red">EN PAUSA</span>' : '<span class="pill green">activo</span>')}
        ${row('Saldo del vault', esc(xlm(s.balance)))}
        ${row('Gastado en 24 h', `${esc(xlm(s.spent_last_24h))} · ${s.payments_last_24h} pago(s)`)}
        ${row('Queda en la ventana', esc(xlm(s.remaining_last_24h)))}
        ${row('Dueño', addr(s.owner))}
        ${row('Agente', addr(s.agent))}
        ${s.recovery ? row('Recuperación (fija)', addr(s.recovery)) : ''}
      </table>
      <table>
        ${row('Monto mínimo', p.min_amount !== undefined ? esc(xlm(p.min_amount)) : '—')}
        ${row('Límite por pago', esc(xlm(p.tx_limit)))}
        ${row('Límite en 24 h', esc(xlm(p.daily_limit)))}
        ${row('Máx. pagos en 24 h', p.max_payments_per_day)}
        ${s.ceilings ? row('Techos inmutables', `${esc(xlm(s.ceilings.max_tx_limit))} por pago · ${esc(xlm(s.ceilings.max_daily_limit))} por 24 h`) : row('Techos', '<span class="pill yellow">no tiene (contrato v1)</span>')}
        ${row('Destinos permitidos', p.allowlist.map(addr).join(' ') || '—')}
      </table>
    </div>
    <p class="hint"><a href="https://stellar.expert/explorer/testnet/contract/${esc(id)}">Ver el contrato en Stellar Expert</a></p>`;
}

async function loadVault(id) {
  $('status').className = 'loading';
  $('status').textContent = 'Leyendo el contrato en testnet…';
  for (const sec of ['agent', 'owner', 'scanner']) $(sec).hidden = true;
  $('scan-result').innerHTML = '';
  $('pay-result').innerHTML = '';
  $('policy-result').innerHTML = '';
  try {
    conn ??= await connect('testnet');
    status = await getVaultStatus(conn, id);
    vaultId = id;
    renderStatus(status, id);
    $('dest').value = status.policy.allowlist[0] ?? '';
    for (const sec of ['agent', 'owner', 'scanner']) $(sec).hidden = false;
    $('owner').hidden = !status.ceilings;
    if (status.ceilings) {
      $('new-tx').value = Number(status.ceilings.max_tx_limit / STROOPS_PER_XLM) + 10;
      $('new-daily').value = Number(status.ceilings.max_daily_limit / STROOPS_PER_XLM) + 10;
    }
  } catch (e) {
    $('status').className = 'error';
    $('status').textContent = `No se pudo leer ese contrato: ${e.message ?? e}. ¿Es un vault CrimsonSentry de testnet?`;
  }
}

// ---------------------------------------------------------------------------
// Simulations (no keys, nothing is sent)
// ---------------------------------------------------------------------------

async function simulate(sourceAccountId, operation) {
  const account = await conn.server.getAccount(sourceAccountId);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: conn.passphrase })
    .addOperation(operation)
    .setTimeout(30)
    .build();
  return conn.server.simulateTransaction(tx);
}

function verdictHtml(sim, okText) {
  if (!rpc.Api.isSimulationError(sim)) {
    return `<div class="verdict ok"><strong>✅ El contrato lo aceptaría.</strong> ${okText}</div>`;
  }
  const m = /Error\(Contract, #(\d+)\)/.exec(sim.error);
  if (m && ERRORS[m[1]]) {
    const [name, why] = ERRORS[m[1]];
    return `<div class="verdict bad"><strong>⛔ Rechazado por el contrato · #${m[1]} ${name}</strong><p>${why}</p></div>`;
  }
  return `<div class="verdict warn"><strong>⚠️ La simulación falló por otro motivo.</strong><p><code>${esc(String(sim.error).slice(0, 280))}</code></p></div>`;
}

async function simulatePay() {
  const out = $('pay-result');
  const mine = ++latest.pay;
  out.innerHTML = '<p class="loading">Simulando…</p>';
  try {
    const dest = $('dest').value.trim();
    const stroops = toStroops($('amount').value || '0');
    const op = new Contract(vaultId).call('pay', new Address(dest).toScVal(), nativeToScVal(stroops, { type: 'i128' }));
    const sim = await simulate(status.agent, op);
    if (mine !== latest.pay) return;
    out.innerHTML = verdictHtml(sim, 'Pasa todas las reglas con el estado actual del vault. Es solo una simulación: no se movió ningún fondo.')
      + '<p class="hint">Las reglas se evalúan en este orden: firma del agente, monto &gt; 0, pausa, allowlist, mínimo, límite por pago, cantidad de pagos, suma y límite de 24 h.</p>';
  } catch (e) {
    out.innerHTML = `<div class="verdict warn"><strong>⚠️ No se pudo simular.</strong><p>${esc(e.message ?? e)}</p></div>`;
  }
}

function policyScVal(p) {
  // A Soroban struct travels as a map with its keys sorted.
  const entry = (k, v) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v });
  return xdr.ScVal.scvMap([
    entry('allowlist', xdr.ScVal.scvVec(p.allowlist.map((a) => new Address(a).toScVal()))),
    entry('daily_limit', nativeToScVal(p.daily_limit, { type: 'i128' })),
    entry('max_payments_per_day', nativeToScVal(p.max_payments_per_day, { type: 'u32' })),
    entry('min_amount', nativeToScVal(p.min_amount, { type: 'i128' })),
    entry('tx_limit', nativeToScVal(p.tx_limit, { type: 'i128' })),
  ]);
}

async function simulatePolicy() {
  const out = $('policy-result');
  const mine = ++latest.policy;
  out.innerHTML = '<p class="loading">Simulando…</p>';
  try {
    const next = {
      ...status.policy,
      tx_limit: toStroops($('new-tx').value || '0'),
      daily_limit: toStroops($('new-daily').value || '0'),
    };
    const sim = await simulate(status.owner, new Contract(vaultId).call('set_policy', policyScVal(next)));
    if (mine !== latest.policy) return;
    const c = status.ceilings;
    out.innerHTML = verdictHtml(sim, `Esa política cabe dentro de los techos (${esc(xlm(c.max_tx_limit))} por pago y ${esc(xlm(c.max_daily_limit))} por 24 h).`);
  } catch (e) {
    out.innerHTML = `<div class="verdict warn"><strong>⚠️ No se pudo simular.</strong><p>${esc(e.message ?? e)}</p></div>`;
  }
}

function preset(name) {
  const shop = status.policy.allowlist[0] ?? '';
  const p = {
    shop: [shop, '8'],
    stranger: [STRANGER, '8'],
    owner: [status.owner, '1'],
    big: [shop, '50'],
    dust: [shop, '0.5'],
  }[name];
  $('dest').value = p[0];
  $('amount').value = p[1];
  simulatePay();
}

// ---------------------------------------------------------------------------
// The scanner, in the browser (same checks.js as the CLI)
// ---------------------------------------------------------------------------

const LIGHT = { green: '🟢', yellow: '🟡', red: '🔴' };
const VERDICT = {
  green: 'Todo en verde',
  yellow: 'Revisar los puntos en amarillo',
  red: 'Riesgo: hay puntos en rojo',
};

async function collect() {
  const expectedWasm = await fetch('./evidence/wasm-sha256.txt', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null)).then((t) => t?.trim() ?? null).catch(() => null);
  const [contractInfo, baseReserve, agentAccount, ownerAccount, agentActivity] = await Promise.all([
    getContractInfo(conn, vaultId),
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
  return {
    status, contractInfo, baseReserve, agentAccount, ownerAccount, agentActivity,
    allowlistAccounts, recoveryAccount, expectedWasm,
    feeBuffer: 2n * STROOPS_PER_XLM, nativeSac: nativeSacId(conn), now: Date.now(),
  };
}

async function runScanner() {
  const out = $('scan-result');
  const mine = ++latest.scan;
  out.innerHTML = '<p class="loading">Leyendo el contrato y las cuentas…</p>';
  try {
    const data = await collect();
    if (mine !== latest.scan) return;
    const results = runChecks(data);
    const overall = verdict(results);
    const asi = [...new Set(results.filter((r) => r.color !== 'green').flatMap((r) => r.asi))].sort();
    out.innerHTML = `
      <div class="verdict ${overall === 'green' ? 'ok' : overall === 'red' ? 'bad' : 'warn'} big">
        <strong>${LIGHT[overall]} ${VERDICT[overall]}</strong>
        <span>🔴 ${results.filter((r) => r.color === 'red').length} · 🟡 ${results.filter((r) => r.color === 'yellow').length} · 🟢 ${results.filter((r) => r.color === 'green').length}</span>
      </div>
      <ul class="checks">
        ${results.map((r) => `
          <li class="${r.color}">
            <span class="light">${LIGHT[r.color]}</span>
            <div>
              <strong>${esc(r.id)} · ${esc(r.title)}</strong>
              ${r.asi.length ? `<small>${r.asi.map(esc).join(' · ')}</small>` : ''}
              <p>${esc(r.detail)}</p>
              ${r.color !== 'green' && r.fix ? `<p class="fix">→ ${esc(r.fix)}</p>` : ''}
            </div>
          </li>`).join('')}
      </ul>
      ${asi.length ? `<p class="hint"><strong>OWASP Agentic Top 10 (2026) con hallazgos:</strong> ${asi.map((a) => esc(`${a} ${ASI[a] ?? ''}`.trim())).join(' · ')}</p>` : ''}
      <p class="hint">Los resultados dependen del momento: por ejemplo, los intentos rechazados de las últimas 24 h encienden C9.</p>`;
  } catch (e) {
    out.innerHTML = `<div class="verdict warn"><strong>⚠️ No se pudo ejecutar el escáner.</strong><p>${esc(e.message ?? e)}</p></div>`;
  }
}

// ---------------------------------------------------------------------------
// Evidence: real transactions, archived in the repo
// ---------------------------------------------------------------------------

async function renderEvidence() {
  const box = $('evidence-table');
  try {
    const items = await (await fetch('./data/evidence.json')).json();
    const groups = [...new Set(items.map((i) => i.group))];
    box.className = '';
    box.innerHTML = groups.map((g) => `
      <h3>${esc(g)}</h3>
      <table class="evidence">
        <thead><tr><th></th><th>Intento</th><th>Resultado</th><th>Transacción</th></tr></thead>
        <tbody>
          ${items.filter((i) => i.group === g).map((i) => `
            <tr class="${i.ok ? 'ok' : 'fail'}">
              <td>${i.ok ? '✅' : '⛔'}</td>
              <td>${esc(i.label)}</td>
              <td>${esc(i.result.replace(/^(✅|⛔|🛑)\s*/, ''))}</td>
              <td><a href="https://stellar.expert/explorer/testnet/tx/${i.hash}">${i.hash.slice(0, 10)}…</a> · <a href="./evidence/archive/txs/${i.hash}.json">copia</a></td>
            </tr>`).join('')}
        </tbody>
      </table>`).join('');
  } catch {
    box.className = 'error';
    box.textContent = 'No se pudo cargar la tabla de evidencia.';
  }
}

// ---------------------------------------------------------------------------

$('load').addEventListener('click', () => loadVault($('vault-id').value.trim()));
$('vault-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('load').click(); });
$('sim-pay').addEventListener('click', simulatePay);
$('sim-policy').addEventListener('click', simulatePolicy);
$('run-scan').addEventListener('click', runScanner);
document.querySelectorAll('[data-vault]').forEach((b) => b.addEventListener('click', () => {
  $('vault-id').value = vaults[b.dataset.vault];
  loadVault(vaults[b.dataset.vault]);
}));
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => preset(b.dataset.preset)));

renderEvidence();
defaultVault().then((id) => {
  $('vault-id').value = id;
  return loadVault(id);
});
