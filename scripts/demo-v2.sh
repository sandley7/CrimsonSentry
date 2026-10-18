#!/usr/bin/env bash
# What the v2 adds, checked on-chain against the vault in evidence/deployment.env:
#
#   1. a payment under the minimum, sent anyway by a "compromised" agent -> FAILED #12
#   2. a valid payment                                                    -> SUCCESS
#   3. the owner withdraws: the money can only go to the recovery address -> SUCCESS
#   4. the owner raises the per-payment limit past the ceiling            -> rejected #14
#   5. the owner sets the policy exactly at the ceilings                  -> SUCCESS
#   6. the owner restores the original policy                             -> SUCCESS
#
# It writes evidence/testnet-v2-features.md with every transaction hash.
#
#   bash scripts/deploy-testnet.sh && bash scripts/demo-v2.sh
#
# Variables: DEPLOYMENT (default evidence/deployment.env), OUT, AGENT_ID (cs-agent).
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
source "${DEPLOYMENT:-evidence/deployment.env}"

NET=testnet
STROOPS=10000000
EXPERT=https://stellar.expert/explorer/testnet
OUT=${OUT:-evidence/testnet-v2-features.md}
AGENT_ID=${AGENT_ID:-cs-agent}
WASM_HASH=$(tr -d '[:space:]' < "${WASM_HASH_FILE:-evidence/wasm-sha256.txt}")
SCENARIO_LOG="evidence/.v2-scenario-$$" # inside the repo: Node on Windows cannot read Git Bash's /tmp

hash_of() { grep -o 'tx/[0-9a-f]\{64\}' | head -1 | cut -d/ -f2; }
link() { echo "[\`${1:0:8}…\`]($EXPERT/tx/$1)"; }
xlm() { awk -v s="$1" -v d="$STROOPS" 'BEGIN { printf "%g", s / d }'; }
row() { echo "| $1 | $2 | $3 |" >> "$OUT"; echo "    -> $2"; }

POLICY_OK=$(printf '{"min_amount":"%s","tx_limit":"%s","daily_limit":"%s","max_payments_per_day":5,"allowlist":["%s"]}' \
  "$((1 * STROOPS))" "$((10 * STROOPS))" "$((25 * STROOPS))" "$SHOP")
POLICY_AT_CEILING=$(printf '{"min_amount":"%s","tx_limit":"%s","daily_limit":"%s","max_payments_per_day":5,"allowlist":["%s"]}' \
  "$((1 * STROOPS))" "$CEILING_TX" "$CEILING_DAILY" "$SHOP")
POLICY_OVER=$(printf '{"min_amount":"%s","tx_limit":"%s","daily_limit":"%s","max_payments_per_day":5,"allowlist":["%s"]}' \
  "$((1 * STROOPS))" "$((CEILING_TX + STROOPS * 10))" "$CEILING_DAILY" "$SHOP")

invoke_owner() { stellar contract invoke --id "$VAULT" --source-account cs-owner --network "$NET" -- "$@" 2>&1; }

{
  echo "# Evidencia en Stellar testnet: lo que añade la v2"
  echo
  echo "- Fecha: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "- Vault: [\`$VAULT\`]($EXPERT/contract/$VAULT)"
  echo "- WASM sha256: \`$WASM_HASH\` ([\`wasm-sha256.txt\`](wasm-sha256.txt))"
  echo "- Dueño \`$OWNER\` · Agente \`$AGENT\` · Comercio \`$SHOP\`"
  echo "- Recuperación (fija): \`$RECOVERY\`"
  echo "- Política: 1 a 10 XLM por pago, 25 XLM por 24 h, máx. 5 pagos · Techos: $(xlm "$CEILING_TX") XLM por pago y $(xlm "$CEILING_DAILY") XLM por 24 h"
  echo
  echo "| Escenario | Resultado on-chain | Transacción |"
  echo "|---|---|---|"
} > "$OUT"

echo "==> 1 y 2. Escenario del agente: pago bajo el mínimo (enviado aunque la simulación lo rechace) y pago válido"
(cd tools && OPEN_FIRST_REJECTION=0 node agent/run.js --vault "$VAULT" --identity "$AGENT_ID" --force \
  --scenario agent/scenario-v2.json --evidence "../$SCENARIO_LOG.md") > /dev/null
under=$(grep -o 'tx/[0-9a-f]\{64\}' "$SCENARIO_LOG.md" | sed -n 1p | cut -d/ -f2)
valid=$(grep -o 'tx/[0-9a-f]\{64\}' "$SCENARIO_LOG.md" | sed -n 2p | cut -d/ -f2)
row "Pago de 0,5 XLM, por debajo del mínimo de 1 XLM, enviado aunque la simulación lo rechaza" "⛔ **FAILED**: \`Error(Contract, #12)\` UnderMinAmount" "$(link "$under")"
row "Pago legítimo de 3 XLM al comercio" "✅ SUCCESS" "$(link "$valid")"

echo "==> 3. El dueño retira 10 XLM: solo puede ir a la dirección de recuperación"
out=$(invoke_owner withdraw --amount $((10 * STROOPS)))
echo "$out" | grep -q "$RECOVERY" || { echo "El retiro no fue a la recuperación"; echo "$out"; exit 1; }
row "El dueño retira 10 XLM: el dinero va **solo** a la dirección de recuperación (evento \`withdrawn\`)" "✅" "$(link "$(echo "$out" | hash_of)")"

echo "==> 4. Subir el límite por pago por encima del techo"
set +e
out=$(invoke_owner set_policy --policy "$POLICY_OVER")
set -e
code=$(echo "$out" | grep -o 'Error(Contract, #[0-9]*)' | head -1)
[ "$code" = "Error(Contract, #14)" ] || { echo "Se esperaba #14, llegó: $code"; echo "$out"; exit 1; }
row "El dueño intenta subir el límite por pago a $(xlm $((CEILING_TX + STROOPS * 10))) XLM (techo: $(xlm "$CEILING_TX"))" "🛑 rechazado en simulación: \`#14\` PolicyOverCeiling" "—"

echo "==> 5. Fijar la política exactamente en los techos"
out=$(invoke_owner set_policy --policy "$POLICY_AT_CEILING")
row "El dueño fija la política exactamente en el techo ($(xlm "$CEILING_TX") / $(xlm "$CEILING_DAILY") XLM)" "✅" "$(link "$(echo "$out" | hash_of)")"

echo "==> 6. Restaurar la política original"
out=$(invoke_owner set_policy --policy "$POLICY_OK")
row "El dueño restaura la política original (10 / 25 XLM)" "✅" "$(link "$(echo "$out" | hash_of)")"

{
  echo
  echo "Registro del agente: ver el resultado del escenario \`tools/agent/scenario-v2.json\`."
  echo
  echo "## Lo que esta evidencia no prueba"
  echo
  echo "- Que la v2 esté auditada: es un prototipo de testnet."
  echo "- Que un dueño comprometido no pueda perder fondos: los techos acotan lo que sale por el camino de pagos del agente en cada ventana de 24 h, pero no lo eliminan. Ver [\`docs/V2.md\`](../docs/V2.md)."
  echo "- Que proteja el saldo propio del agente ni los pagos x402/MPP: la arquitectura sigue siendo la A."
} >> "$OUT"
rm -f "$SCENARIO_LOG" "$SCENARIO_LOG.md"
echo
echo "Evidence written to $OUT"
