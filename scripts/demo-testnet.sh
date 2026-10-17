#!/usr/bin/env bash
# Runs the jury demo against the deployed vault and records every tx hash in
# evidence/testnet-evidence.md (with Stellar Expert links).
#
#   bash scripts/deploy-testnet.sh   # once
#   bash scripts/demo-testnet.sh
#
# Scenarios:
#   1. valid payment                               -> SUCCESS on-chain
#   2. over per-tx limit / non-allowlisted target  -> rejected at simulation
#   3. "parallel spend" attack: two payments that each pass simulation on
#      their own; the vault sees the running total on-chain and the second
#      one REVERTS with Error(Contract, #3) OverDailyLimit -> FAILED tx hash
#   4. kill switch: owner pauses, agent is blocked, owner unpauses
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
source "${DEPLOYMENT:-evidence/deployment.env}"

NET=testnet
STROOPS=10000000
EXPERT=https://stellar.expert/explorer/testnet
OUT=${OUT:-evidence/testnet-evidence.md}

{
  echo "# CrimsonSentry — evidencia en testnet"
  echo
  echo "- Fecha: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "- Vault: [\`$VAULT\`]($EXPERT/contract/$VAULT)"
  echo "- Agente: \`$AGENT\` · Dueño: \`$OWNER\` · Comercio permitido: \`$SHOP\`"
  echo "- Política: 1 a 10 XLM por pago, 25 XLM por 24h móviles, máx. 5 pagos por 24h"
  echo
  echo "| # | Escenario | Resultado | Transacción |"
  echo "|---|---|---|---|"
} > "$OUT"

row() { echo "| $1 | $2 | $3 | $4 |" >> "$OUT"; echo "    -> $3"; }

# Builds an unsigned `pay` tx from the agent without sending it. `--build-only`
# does not simulate, so `tx simulate` adds the Soroban resources and the auth
# entry (without them the network rejects the tx as TxMalformed).
build_pay() { # <monto-en-stroops>
  stellar contract invoke --id "$VAULT" --source-account cs-agent --network "$NET" \
    --build-only -- pay --destino "$SHOP" --monto "$1" \
    | stellar tx simulate --network "$NET" --source-account cs-agent --instruction-leeway 2000000
}

sign() { stellar tx sign --sign-with-key cs-agent --network "$NET"; }

# Sends a signed tx; prints SUCCESS/FAILED and records the hash.
send() { # <n> <label> <signed-xdr>
  local hash
  hash=$(echo "$3" | stellar tx hash --network "$NET")
  if echo "$3" | stellar tx send --network "$NET" >/dev/null 2>evidence/last-error.log; then
    row "$1" "$2" "✅ SUCCESS" "[\`${hash:0:12}…\`]($EXPERT/tx/$hash)"
  else
    row "$1" "$2" "⛔ FAILED (revertida)" "[\`${hash:0:12}…\`]($EXPERT/tx/$hash)"
  fi
}

# Normal invoke expected to be rejected during simulation.
expect_reject() { # <n> <label> <args...>
  local n=$1 label=$2; shift 2
  local err
  if err=$(stellar contract invoke --id "$VAULT" --source-account cs-agent --network "$NET" -- "$@" 2>&1); then
    row "$n" "$label" "⚠️ NO BLOQUEADO" "—"
  else
    code=$(echo "$err" | grep -o 'Error(Contract, #[0-9]*)' | head -1)
    row "$n" "$label" "🛑 bloqueado en simulación: \`${code:-ver log}\`" "— (nunca llega a la red)"
  fi
}

echo "==> 1. Valid payment: 10 XLM to the allowlisted shop"
send 1 "Pago válido de 10 XLM" "$(build_pay $((10 * STROOPS)) | sign)"

echo "==> 2a. Over per-tx limit: 15 XLM"
expect_reject 2a "Pago de 15 XLM (límite por pago 10)" pay --destino "$SHOP" --monto $((15 * STROOPS))

echo "==> 2b. Destination not allowlisted"
expect_reject 2b "Pago a dirección fuera de la allowlist" pay --destino "$OWNER" --monto $((1 * STROOPS))

echo "==> 3. Parallel-spend attack (10 XLM spent so far, 25 XLM/24h limit)"
# Both txs are built now, while only 10 XLM have been spent: each one alone
# passes simulation (10 + 10 = 20 <= 25).
TX_B=$(build_pay $((10 * STROOPS)))
send 3a "Ataque: pago paralelo A de 10 XLM (acumulado 20)" "$(build_pay $((10 * STROOPS)) | sign)"
# B was built before A landed: give it the next sequence number, then sign.
TX_B=$(echo "$TX_B" | stellar tx update sequence-number next --network "$NET" | sign)
send 3b "Ataque: pago paralelo B de 10 XLM (acumulado 30 > 25)" "$TX_B"

echo "==> 4. Kill switch"
stellar contract invoke --id "$VAULT" --source-account cs-owner --network "$NET" -- pause >/dev/null
expect_reject 4 "Pago de 1 XLM con el vault en pausa" pay --destino "$SHOP" --monto $((1 * STROOPS))
stellar contract invoke --id "$VAULT" --source-account cs-owner --network "$NET" -- unpause >/dev/null

{
  echo
  echo "## Estado final del vault"
  echo
  echo '```json'
  stellar contract invoke --id "$VAULT" --source-account cs-owner --network "$NET" --send=no -- get_status
  echo '```'
} >> "$OUT"

echo
echo "Evidence written to $OUT"
cat "$OUT"
