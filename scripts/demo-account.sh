#!/usr/bin/env bash
# Architecture B on testnet. The agent pays from its own ACCOUNT (a contract)
# with a plain token transfer, the same call x402 makes, and the account's
# __check_auth applies the policy. Fees are paid by a separate "relayer", like
# an x402 facilitator would.
#
#   node tools/agent-account/demo.js init
#   bash scripts/deploy-account.sh
#   bash scripts/demo-account.sh
#
# Scenarios (all recorded with transaction hashes in evidence/agent-account/testnet-evidence.md):
#   1. a valid payment                                          -> SUCCESS
#   2. out-of-policy payments, simulated with the real auth     -> rejected (#1, #12, #2)
#   3. a "compromised client" sends a payment that passed simulation after the
#      policy changed back                                      -> FAILED on-chain (#1)
#   4. the parallel-spend attack: two payments that each pass simulation, the
#      account sees the running total                           -> second FAILED on-chain (#3)
#   5. the owner key can only move funds to the recovery address
#   6. pause blocks the agent
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
source "${ACCOUNT_ENV:-evidence/agent-account/deployment.env}"

NET=testnet
S=10000000
EXPERT=https://stellar.expert/explorer/testnet
OUT=${OUT:-evidence/agent-account/testnet-evidence.md}
DEMO="node tools/agent-account/demo.js"
STRANGER=GAMV2LI3GDTTOBOSYEOVTRBKG4ZGQAUV4HBIX3KHWH547PCR3WZQV4AO

j() { python -c "import sys,json; d=json.loads(sys.stdin.read().strip().splitlines()[-1]); print(d.get('$1',''))"; }
link() { echo "[\`${1:0:8}…\`]($EXPERT/tx/$1)"; }
row() { echo "| $1 | $2 | $3 |" >> "$OUT"; echo "    -> $2"; }
owner_invoke() { stellar contract invoke --id "$ACCOUNT" --source-account cs-owner --network "$NET" -- "$@" 2>&1; }

policy() { # <tx_limit_xlm> <daily_xlm> <allowlist-json-array-of-quoted-addresses>
  printf '{"min_amount":"%s","tx_limit":"%s","daily_limit":"%s","max_payments_per_day":5,"allowlist":[%s]}' "$((1 * S))" "$(($1 * S))" "$(($2 * S))" "$3"
}
POLICY_OK=$(policy 10 25 "\"$SHOP\"")
POLICY_STRANGER=$(policy 10 25 "\"$SHOP\",\"$STRANGER\"")

# Sends what `prepare` built and records the outcome in the evidence table.
send_row() { # <label> <expected-ok|failed>
  local res; res=$($DEMO send)
  local hash status code; hash=$(echo "$res" | j hash); status=$(echo "$res" | j status); code=$(echo "$res" | j code)
  if [ "$status" = SUCCESS ]; then
    row "$1" "✅ SUCCESS" "$(link "$hash")"
  else
    row "$1" "⛔ **FAILED**${code:+: \`Error(Contract, #$code)\`}" "$(link "$hash")"
  fi
}

# Simulated with the real authorization: prints the verdict.
sim_row() { # <label> <to> <xlm> [as]
  local res; res=$($DEMO sim --account "$ACCOUNT" --to "$2" --amount "$3" --as "${4:-agent}")
  if [ "$(echo "$res" | j ok)" = True ]; then row "$1" "✅ aceptado en simulación" "—"
  else row "$1" "🛑 rechazado en simulación: \`#$(echo "$res" | j code)\`" "— (nunca llega a la red)"; fi
}

{
  echo "# Arquitectura B en testnet: pagar desde una cuenta-contrato"
  echo
  echo "- Fecha: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "- Cuenta del agente: [\`$ACCOUNT\`]($EXPERT/contract/$ACCOUNT)"
  echo "- Dueño \`$OWNER\` · Comercio \`$SHOP\` · Recuperación \`$RECOVERY\` · Relayer (paga las comisiones) \`$RELAYER\`"
  echo "- Política: 1 a 10 XLM por pago, 25 XLM por 24 h, máx. 5 pagos · Techos: $((CEILING_TX / S)) XLM por pago y $((CEILING_DAILY / S)) XLM por 24 h"
  echo "- El agente solo firma la autorización de un \`transfer\` del token; no llama a ningún vault."
  echo
  echo "| Escenario | Resultado | Transacción |"
  echo "|---|---|---|"
} > "$OUT"

echo "==> 1. Pago válido de 8 XLM, firmado por el agente y pagado por el relayer"
$DEMO prepare --account "$ACCOUNT" --to "$SHOP" --amount 8 > /dev/null
send_row "Pago válido de 8 XLM al comercio"

echo "==> 2. Intentos fuera de la política, con la autorización real (modo enforce)"
sim_row "50 XLM a una dirección fuera de la allowlist" "$STRANGER" 8
sim_row "Pago de 0,5 XLM, por debajo del mínimo" "$SHOP" 0.5
sim_row "Pago de 15 XLM, por encima del límite por pago" "$SHOP" 15
sim_row "El dueño intenta mover fondos al comercio (solo puede ir a la recuperación)" "$SHOP" 1 owner

echo "==> 3. Cliente comprometido: un pago que pasó la simulación y se envía cuando la política ya no lo permite"
owner_invoke set_policy --policy "$POLICY_STRANGER" > /dev/null
$DEMO prepare --account "$ACCOUNT" --to "$STRANGER" --amount 8 > /dev/null
owner_invoke set_policy --policy "$POLICY_OK" > /dev/null
send_row "8 XLM a una dirección fuera de la allowlist, enviado aunque la política ya no lo permite"

echo "==> 4. Ataque de pagos paralelos (cada pago pasa la simulación por separado)"
$DEMO prepare --account "$ACCOUNT" --to "$SHOP" --amount 10 --out evidence/agent-account/.tx-a.xdr > /dev/null
$DEMO prepare --account "$ACCOUNT" --to "$SHOP" --amount 10 --seq-offset 1 --out evidence/agent-account/.tx-b.xdr > /dev/null
$DEMO send --file evidence/agent-account/.tx-a.xdr > "$OUT.a"
$DEMO send --file evidence/agent-account/.tx-b.xdr > "$OUT.b"
for x in a b; do
  res=$(cat "$OUT.$x"); hash=$(echo "$res" | j hash); status=$(echo "$res" | j status); code=$(echo "$res" | j code)
  if [ "$x" = a ]; then label="Ataque: pago paralelo A de 10 XLM (acumulado 18)"; else label="Ataque: pago paralelo B de 10 XLM (acumulado 28 > 25)"; fi
  if [ "$status" = SUCCESS ]; then row "$label" "✅ SUCCESS" "$(link "$hash")"
  else row "$label" "⛔ **FAILED**${code:+: \`Error(Contract, #$code)\`}" "$(link "$hash")"; fi
done
rm -f "$OUT.a" "$OUT.b" evidence/agent-account/.tx-a.xdr evidence/agent-account/.tx-b.xdr

echo "==> 5. La clave del dueño solo mueve fondos a la dirección de recuperación"
$DEMO prepare --account "$ACCOUNT" --to "$RECOVERY" --amount 10 --as owner > /dev/null
send_row "El dueño mueve 10 XLM a la dirección de recuperación"

echo "==> 6. Pausa"
owner_invoke pause > /dev/null
sim_row "Pago de 1 XLM con la cuenta en pausa" "$SHOP" 1
owner_invoke unpause > /dev/null

{
  echo
  echo "## Estado final de la cuenta"
  echo
  echo '```json'
  stellar contract invoke --id "$ACCOUNT" --source-account cs-owner --network "$NET" --send=no -- get_status
  echo '```'
  echo
  echo "## Lo que esta evidencia no prueba"
  echo
  echo "- Que la cuenta funcione con un facilitador x402 real: aquí el relayer es un script propio. Ver [\`docs/ARQUITECTURA-B.md\`](../../docs/ARQUITECTURA-B.md)."
  echo "- Que esté auditada: es un prototipo de testnet."
} >> "$OUT"
echo
echo "Evidence written to $OUT"
