// The scanner's checks. Every check is a pure function of the data collected
// by scan.js, so the whole traffic-light logic can be unit-tested offline.
//
// Colors: 'red' = exploitable or broken now, 'yellow' = weak or worth a look,
// 'green' = OK. Each result carries the OWASP Top 10 for Agentic Applications
// (2026) risks it relates to.

import { xlm, toStroops, LEDGERS_PER_DAY } from '../lib/stellar.js';

const DAY_MS = 86_400_000;
const PAYMENT_OPS = new Set([
  'payment',
  'path_payment_strict_send',
  'path_payment_strict_receive',
  'create_account',
  'account_merge',
  'create_claimable_balance',
]);

function result(id, title, asi, color, detail, fix = '') {
  return { id, title, asi, color, detail, fix };
}

function nativeBalance(account) {
  const b = account.balances.find((x) => x.asset_type === 'native');
  return b ? toStroops(b.balance) : 0n;
}

/** Native XLM the account can move right now: balance minus reserve and open offers. */
export function spendableNative(account, baseReserve) {
  const native = account.balances.find((x) => x.asset_type === 'native');
  if (!native) return 0n;
  const entries =
    2n +
    BigInt(account.subentry_count ?? 0) +
    BigInt(account.num_sponsoring ?? 0) -
    BigInt(account.num_sponsored ?? 0);
  const spendable = toStroops(native.balance) - entries * baseReserve - toStroops(native.selling_liabilities ?? '0');
  return spendable > 0n ? spendable : 0n;
}

function activeSigners(account) {
  return account.signers.filter((s) => s.weight > 0);
}

// ---------------------------------------------------------------------------

function c1AgentOwnFunds(d) {
  const t = ['C1', 'Saldo propio del agente', ['ASI02', 'ASI03', 'ASI10']];
  if (!d.agentAccount) return result(...t, 'green', 'La cuenta del agente no existe en la red: no tiene fondos propios.');
  const spendable = spendableNative(d.agentAccount, d.baseReserve);
  const txLimit = d.status.policy.tx_limit;
  const vault = d.status.balance;
  const ratio = vault > 0n && spendable >= vault ? ` (${(Number(spendable) / Number(vault)).toFixed(1)}× lo que protege el vault)` : '';
  const detail = `El agente puede mover ${xlm(spendable)} fuera del vault${ratio}.`;
  const fix = 'Devolver el excedente al dueño y dejar al agente solo con lo necesario para fees (o que un relayer pague los fees con fee-bump).';
  if (spendable > txLimit) return result(...t, 'red', `${detail} Puede pagar sin pasar por ninguna regla.`, fix);
  if (spendable > d.feeBuffer) return result(...t, 'yellow', `${detail} Es más de lo que necesita para fees.`, fix);
  return result(...t, 'green', `${detail} Solo cubre fees.`);
}

function c2AgentOtherAssets(d) {
  const t = ['C2', 'Otros activos en la cuenta del agente', ['ASI02', 'ASI03']];
  if (!d.agentAccount) return result(...t, 'green', 'Sin cuenta, sin activos.');
  const others = d.agentAccount.balances.filter((b) => b.asset_type !== 'native');
  const funded = others.filter((b) => toStroops(b.balance) > 0n);
  if (funded.length) {
    const list = funded.map((b) => `${b.balance} ${b.asset_code ?? b.liquidity_pool_id}`).join(', ');
    return result(...t, 'red', `El agente tiene activos fuera del vault: ${list}.`, 'Mover esos activos al vault o a la cuenta del dueño.');
  }
  if (others.length) return result(...t, 'yellow', `${others.length} trustline(s) abiertas con saldo 0.`, 'Cerrar las trustlines que el agente no necesita.');
  return result(...t, 'green', 'Solo XLM nativo.');
}

function c3AgentSigners(d) {
  const t = ['C3', 'Firmantes de la cuenta del agente', ['ASI03']];
  if (!d.agentAccount) return result(...t, 'green', 'Sin cuenta.');
  const extra = activeSigners(d.agentAccount).filter((s) => s.key !== d.agentAccount.account_id);
  if (extra.length) {
    return result(...t, 'yellow', `Hay ${extra.length} firmante(s) extra: ${extra.map((s) => `${s.key.slice(0, 6)}… (peso ${s.weight})`).join(', ')}.`,
      'Verificar que cada firmante extra sea conocido; si no, quitarlo con SetOptions.');
  }
  return result(...t, 'green', 'Solo la clave del agente.');
}

function c4RoleSeparation(d) {
  const t = ['C4', 'Separación dueño / agente', ['ASI03']];
  const { owner, agent } = d.status;
  if (owner === agent) return result(...t, 'red', 'El agente ES el dueño: puede cambiar sus propias reglas y retirar todo.', 'Desplegar un vault con claves distintas.');
  if (d.ownerAccount && activeSigners(d.ownerAccount).some((s) => s.key === agent)) {
    return result(...t, 'red', 'La clave del agente puede firmar por el dueño.', 'Quitar al agente de los firmantes del dueño.');
  }
  return result(...t, 'green', 'Dueño y agente son claves distintas y el agente no firma por el dueño.');
}

function c5PartiesInAllowlist(d) {
  const t = ['C5', 'Agente o dueño dentro de la allowlist', ['ASI02', 'ASI03']];
  const list = d.status.policy.allowlist;
  if (list.includes(d.status.agent)) {
    return result(...t, 'red', 'El agente está en su propia allowlist: puede pasarse fondos del vault a sí mismo y gastarlos sin control.',
      'Quitar al agente de la allowlist con set_policy.');
  }
  if (list.includes(d.status.owner)) {
    return result(...t, 'yellow', 'El dueño está en la allowlist (el agente puede devolverle fondos; normalmente eso lo hace withdraw).',
      'Quitar al dueño de la allowlist salvo que sea intencional.');
  }
  return result(...t, 'green', 'Ni el agente ni el dueño son destinos permitidos.');
}

function c6AllowlistHygiene(d) {
  const t = ['C6', 'Higiene de la allowlist', ['ASI02', 'ASI04', 'ASI07']];
  const list = d.status.policy.allowlist;
  if (list.length === 0) return result(...t, 'yellow', 'Allowlist vacía: el agente no puede pagar a nadie.', 'Agregar los comercios legítimos.');
  const issues = [];
  const contracts = list.filter((a) => a.startsWith('C'));
  if (contracts.length) issues.push(`${contracts.length} destino(s) son contratos, que podrían reenviar los fondos`);
  const missing = list.filter((a) => a.startsWith('G') && d.allowlistAccounts[a] === false);
  if (missing.length) issues.push(`${missing.length} cuenta(s) no existen en la red`);
  if (list.length > 10) issues.push(`${list.length} destinos (más de 10 amplía la superficie de ataque)`);
  if (issues.length) return result(...t, 'yellow', `${issues.join('; ')}.`, 'Revisar cada destino y dejar solo cuentas verificadas.');
  return result(...t, 'green', `${list.length} destino(s), todos cuentas existentes.`);
}

function c7LimitProportions(d) {
  const t = ['C7', 'Proporción de los límites', ['ASI08']];
  const { tx_limit, daily_limit, max_payments_per_day } = d.status.policy;
  const issues = [];
  if (tx_limit === daily_limit) issues.push('un solo pago puede agotar todo el límite diario');
  if (d.status.balance > 0n && daily_limit >= d.status.balance) issues.push('el límite diario permite vaciar el vault en 24h');
  if (max_payments_per_day > 20) issues.push(`${max_payments_per_day} pagos por día es mucho margen para un bucle`);
  const summary = `${xlm(tx_limit)} por pago · ${xlm(daily_limit)} por 24h · ${max_payments_per_day} pagos por 24h`;
  if (issues.length) return result(...t, 'yellow', `${summary}. Atención: ${issues.join('; ')}.`, 'Ajustar con set_policy.');
  return result(...t, 'green', summary);
}

function c8WindowUsage(d) {
  const t = ['C8', 'Consumo de la ventana de 24h', ['ASI08', 'ASI10']];
  const { spent_last_24h: spent, payments_last_24h: payments, policy } = d.status;
  const pct = policy.daily_limit > 0n ? Number((spent * 100n) / policy.daily_limit) : 0;
  const detail = `Gastado ${xlm(spent)} de ${xlm(policy.daily_limit)} (${pct}%) · ${payments}/${policy.max_payments_per_day} pagos.`;
  if (pct >= 80 || payments >= policy.max_payments_per_day) {
    return result(...t, 'yellow', `${detail} Cerca del tope: ¿comportamiento normal o un agente desbocado?`, 'Revisar los eventos "paid" recientes; pausar si no se reconocen.');
  }
  return result(...t, 'green', detail);
}

function c9FailedAttempts(d) {
  const t = ['C9', 'Intentos fallidos del agente (24h)', ['ASI01', 'ASI10']];
  const since = d.now - DAY_MS;
  // Horizon also lists txs sent by others that merely touch the agent's account.
  const failed = d.agentActivity.transactions.filter(
    (tx) => tx.source_account === d.status.agent && !tx.successful && Date.parse(tx.created_at) >= since,
  );
  if (failed.length === 0) return result(...t, 'green', 'Ninguna transacción rechazada on-chain.');
  const detail = `${failed.length} tx rechazada(s) on-chain: ${failed.slice(0, 3).map((tx) => tx.hash.slice(0, 8) + '…').join(', ')}.`;
  if (failed.length >= 3) return result(...t, 'red', `${detail} Patrón típico de un agente secuestrado que insiste.`, 'Pausar el vault (pause) y revisar al agente.');
  return result(...t, 'yellow', `${detail} El vault bloqueó algo que el agente intentó.`, 'Revisar qué intentó pagar y por qué.');
}

function c10ObservedBypass(d) {
  const t = ['C10', 'Pagos del agente por fuera del vault', ['ASI02', 'ASI10']];
  const agent = d.status.agent;
  const own = d.agentActivity.operations.filter((op) => op.source_account === agent && op.transaction_successful !== false);
  const bypass = [];
  const refunds = [];
  for (const op of own) {
    if (PAYMENT_OPS.has(op.type)) {
      const to = op.to ?? op.account ?? op.into ?? op.funder;
      (to === d.status.owner ? refunds : bypass).push(`${op.type} → ${to ? to.slice(0, 6) + '…' : '?'}`);
    } else if (op.type === 'invoke_host_function') {
      for (const ch of op.asset_balance_changes ?? []) {
        if (ch.from === agent) bypass.push(`transfer SAC de ${ch.amount} → ${ch.to.slice(0, 6)}…`);
      }
    }
  }
  if (bypass.length) {
    return result(...t, 'red', `${bypass.length} movimiento(s) del agente sin pasar por el vault: ${bypass.slice(0, 3).join('; ')}.`,
      'Investigar esos pagos: la clave del agente se está usando por fuera de la política.');
  }
  const note = refunds.length ? ` (${refunds.length} devolución(es) al dueño, que son legítimas)` : '';
  return result(...t, 'green', `Todos los pagos del agente pasan por el vault${note}.`);
}

function c11KillSwitch(d) {
  const t = ['C11', 'Kill switch disponible', ['ASI09', 'ASI10']];
  if (!d.ownerAccount) return result(...t, 'red', 'La cuenta del dueño no existe: nadie puede pausar ni retirar.', 'Crear/fondear la cuenta del dueño.');
  const spendable = spendableNative(d.ownerAccount, d.baseReserve);
  if (spendable < 10_000_000n) return result(...t, 'red', `El dueño tiene ${xlm(spendable)}: no alcanza para pagar el fee de pause.`, 'Fondear la cuenta del dueño.');
  if (d.status.paused) return result(...t, 'yellow', 'El vault está EN PAUSA: el agente no puede pagar.', 'unpause cuando el incidente esté resuelto.');
  return result(...t, 'green', 'El dueño puede pausar o retirar en cualquier momento.');
}

function c12OwnerKey(d) {
  const t = ['C12', 'Fortaleza de la clave del dueño', ['ASI03', 'ASI09']];
  if (!d.ownerAccount) return result(...t, 'yellow', 'Dueño sin cuenta clásica (¿contrato?): verificar su __check_auth.');
  const signers = activeSigners(d.ownerAccount);
  const med = d.ownerAccount.thresholds.med_threshold;
  if (signers.length >= 2 && med >= 2) return result(...t, 'green', `Multifirma: ${signers.length} firmantes, umbral ${med}.`);
  return result(...t, 'yellow', 'Una sola clave controla el vault (withdraw sin tope, set_policy, set_agent).',
    'Convertir la cuenta del dueño en multifirma (SetOptions) o usar una hardware wallet.');
}

function c13CodeIntegrity(d) {
  const t = ['C13', 'Integridad del código desplegado', ['ASI04']];
  const got = d.contractInfo.wasmSha256;
  if (!d.expectedWasm) return result(...t, 'yellow', `WASM on-chain ${got.slice(0, 12)}… sin hash de referencia para comparar.`, 'Pasar --expected-wasm con el hash del build auditado.');
  if (got === d.expectedWasm.toLowerCase()) return result(...t, 'green', `El WASM on-chain (${got.slice(0, 12)}…) es el build auditado.`);
  return result(...t, 'red', `El WASM on-chain (${got.slice(0, 12)}…) NO coincide con el auditado (${d.expectedWasm.slice(0, 12)}…).`, 'No confiar en este vault hasta revisar su código.');
}

function c14TokenIntegrity(d) {
  const t = ['C14', 'Token que custodia el vault', ['ASI04']];
  if (d.status.token === d.nativeSac) return result(...t, 'green', 'XLM nativo (Stellar Asset Contract oficial).');
  return result(...t, 'yellow', `Token ${d.status.token.slice(0, 8)}… no es XLM nativo.`, 'Verificar que sea el SAC oficial del activo esperado.');
}

function c15Liveness(d) {
  const t = ['C15', 'Vida del contrato (TTL)', ['ASI08']];
  const { liveUntil, latestLedger } = d.contractInfo;
  if (liveUntil == null || liveUntil < latestLedger) {
    return result(...t, 'red', 'La instancia del contrato está archivada.', 'Restaurarla (la próxima invocación la restaura pagando el fee de restore).');
  }
  const days = (liveUntil - latestLedger) / LEDGERS_PER_DAY;
  if (days < 7) return result(...t, 'yellow', `Quedan ~${days.toFixed(1)} días antes de que se archive.`, 'Extender el TTL (stellar contract extend) o usar el vault.');
  return result(...t, 'green', `Vivo por ~${days.toFixed(0)} días más.`);
}

function c16VaultFunds(d) {
  const t = ['C16', 'Fondos operativos del vault', []];
  const { balance, policy } = d.status;
  if (balance < policy.tx_limit) return result(...t, 'yellow', `Saldo ${xlm(balance)}, menor que un pago máximo (${xlm(policy.tx_limit)}).`, 'Fondear el vault.');
  return result(...t, 'green', `Saldo ${xlm(balance)}.`);
}

function c17RecoveryAndCeilings(d) {
  const t = ['C17', 'Dirección de recuperación y techos de la política', ['ASI03', 'ASI09']];
  const { recovery, ceilings, owner, agent, balance } = d.status;
  if (!recovery || !ceilings) {
    return result(...t, 'yellow',
      'Contrato v1: el dueño puede retirar a cualquier dirección y aflojar la política sin un techo.',
      'Desplegar la v2 (dirección de recuperación fija y techos inmutables) y migrar los fondos.');
  }
  const RANK = { green: 0, yellow: 1, red: 2 };
  const issues = [];
  const flag = (color, text, fix) => issues.push({ color, text, fix });

  if (recovery === owner || recovery === agent) {
    flag('red', 'La dirección de recuperación coincide con el dueño o el agente: fijarla no protege nada.',
      'Desplegar un vault nuevo con una recuperación distinta.');
  } else if (recovery.startsWith('G')) {
    if (d.recoveryAccount === null) {
      flag('yellow', 'La cuenta de recuperación no existe en la red: un retiro hacia ella probablemente fallaría hasta crearla y fondearla.',
        'Crear y fondear la cuenta de recuperación.');
    } else if (d.recoveryAccount) {
      const signers = activeSigners(d.recoveryAccount);
      const med = d.recoveryAccount.thresholds.med_threshold;
      if (!(signers.length >= 2 && med >= 2)) {
        flag('yellow', 'Una sola clave controla la cuenta de recuperación.',
          'Hacerla multifirma o guardarla en frío (hardware wallet).');
      }
    }
  }
  if (balance > 0n && ceilings.max_daily_limit >= balance) {
    flag('yellow',
      `El techo diario (${xlm(ceilings.max_daily_limit)}) alcanza para vaciar el vault (${xlm(balance)}) en 24 h, aunque el dueño quede comprometido.`,
      'Desplegar un vault con un techo diario menor que el saldo, o fondearlo por encima del techo.');
  }

  const worst = issues.reduce((w, i) => (RANK[i.color] > RANK[w] ? i.color : w), 'green');
  if (worst === 'green') {
    const note = recovery.startsWith('C') ? ' La recuperación es una cuenta-contrato: verifica su __check_auth.' : '';
    return result(...t, 'green',
      `Recuperación fija ${recovery.slice(0, 6)}…${recovery.slice(-4)} · techos de ${xlm(ceilings.max_tx_limit)} por pago y ${xlm(ceilings.max_daily_limit)} por 24 h.${note}`);
  }
  return result(...t, worst, issues.map((i) => i.text).join(' '), issues.map((i) => i.fix).join(' '));
}

export const CHECKS = [
  c1AgentOwnFunds, c2AgentOtherAssets, c3AgentSigners, c4RoleSeparation,
  c5PartiesInAllowlist, c6AllowlistHygiene, c7LimitProportions, c8WindowUsage,
  c9FailedAttempts, c10ObservedBypass, c11KillSwitch, c12OwnerKey,
  c13CodeIntegrity, c14TokenIntegrity, c15Liveness, c16VaultFunds, c17RecoveryAndCeilings,
];

export function runChecks(data) {
  return CHECKS.map((check) => check(data));
}

const RANK = { green: 0, yellow: 1, red: 2 };

/** The overall verdict is the worst color found. */
export function verdict(results) {
  return results.reduce((worst, r) => (RANK[r.color] > RANK[worst] ? r.color : worst), 'green');
}
