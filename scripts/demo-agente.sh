#!/usr/bin/env bash
# End-to-end demo for the video, on a FRESH agent and vault every run, so it
# is reproducible and never touches the official evidence in the README:
#
#   1. a new agent account holding 500 XLM of its own (a typical hot wallet)
#   2. a new Policy Vault for that agent (100 XLM, same policy as the main one)
#   3. scanner → red: the agent can spend outside the vault
#   4. the agent returns its surplus to the owner → scanner again
#   5. the agent runs tools/agent/scenario.json as a compromised client: every
#      attempt the simulation rejects is sent anyway, so the vault rejects it on-chain
#   6. scanner → the rejected attempts show up
#   7. the owner pauses the vault → the agent is blocked → final scan
#
#   bash scripts/demo-agente.sh            # STEP=1 pauses before each step (for recording)
#
# Evidence: evidence/agent-demo-<run>.md and evidence/demo-<run>.env
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

NET=testnet
RUN=$(date +%Y%m%d-%H%M%S)
AGENT_ID="cs-demo-agent-$RUN"
EVIDENCE_DIR=${EVIDENCE_DIR:-evidence}
OUT="$EVIDENCE_DIR/demo-$RUN.env"
EVID="$EVIDENCE_DIR/agent-demo-$RUN.md"

step() {
  if [ "${STEP:-0}" = 1 ]; then read -rp $'\n[Enter] '"$1"; else printf '\n==> %s\n' "$1"; fi
}
scan() { (cd tools && node scanner/scan.js --vault "$VAULT") || true; }

step "1. Nuevo agente con 500 XLM propios (una hot wallet típica)"
stellar keys generate "$AGENT_ID" >/dev/null
AGENT=$(stellar keys address "$AGENT_ID")
stellar tx new create-account --source-account cs-owner --destination "$AGENT" \
  --starting-balance 5000000000 --network "$NET" >/dev/null
echo "Agente: $AGENT"

step "2. Vault nuevo para ese agente (10 XLM por pago, 25 XLM por 24h, 5 pagos por 24h)"
AGENT_ID="$AGENT_ID" VAULT_ALIAS="crimson-demo-$RUN" OUT="$OUT" \
  bash scripts/deploy-testnet.sh > "$EVIDENCE_DIR/.deploy-$RUN.log" 2>&1 \
  || { tail -20 "$EVIDENCE_DIR/.deploy-$RUN.log"; exit 1; }
rm -f "$EVIDENCE_DIR/.deploy-$RUN.log"
source "$OUT"
echo "Vault: $VAULT"
echo "       https://stellar.expert/explorer/testnet/contract/$VAULT"

step "3. Escáner: ¿qué tan protegido está este agente?"
scan

step "4. El agente devuelve el excedente al dueño y se queda con 3 XLM para fees"
stellar tx new payment --source-account "$AGENT_ID" --destination "$OWNER" \
  --amount 4970000000 --network "$NET" >/dev/null
scan

step "5. El agente ejecuta el guion como cliente comprometido"
(cd tools && OPEN_FIRST_REJECTION=${OPEN_FIRST_REJECTION:-1} node agent/run.js --vault "$VAULT" --identity "$AGENT_ID" --force --evidence "../$EVID")

step "6. Escáner: el dueño ve los intentos rechazados"
scan

step "7. El dueño activa el kill switch"
stellar contract invoke --id "$VAULT" --source-account cs-owner --network "$NET" -- pause 2>&1 \
  | grep -o 'https://stellar.expert[^ ]*tx/[0-9a-f]*' | head -1 | sed 's/^/Pausa: /'
(cd tools && node agent/run.js --vault "$VAULT" --identity "$AGENT_ID" --force --phase afterPause --evidence "../$EVID")
scan

printf '\nEvidencia: %s\n' "$EVID"
