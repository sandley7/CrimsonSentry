#!/usr/bin/env bash
# Deploys the agent account (architecture B) to testnet and funds it.
#
#   node tools/agent-account/demo.js init     # once: throwaway agent/owner keys + a funded relayer
#   bash scripts/deploy-account.sh
#
# Same owner, recovery address and shop as the vault (evidence/deployment.env).
# The agent key is the throwaway one from tools/agent-account/.keys.json; the
# account holds 100 XLM of testnet funds. Writes evidence/agent-account/deployment.env.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
source "${DEPLOYMENT:-evidence/deployment.env}"

NET=testnet
STROOPS=10000000
OUT=${OUT:-evidence/agent-account/deployment.env}
FUNDING=${FUNDING_XLM:-100}

keys=$(node tools/agent-account/demo.js init)
AGENT_KEY=$(echo "$keys" | python -c "import sys,json; print(json.load(sys.stdin)['agent_key_hex'])")
OWNER_KEY=$(echo "$keys" | python -c "import sys,json; print(json.load(sys.stdin)['owner_key_hex'])")
RELAYER=$(echo "$keys" | python -c "import sys,json; print(json.load(sys.stdin)['relayer'])")

echo "==> Building"
stellar contract build --package agent-account

POLICY=$(printf '{"min_amount":"%s","tx_limit":"%s","daily_limit":"%s","max_payments_per_day":5,"allowlist":["%s"]}' \
  "$((1 * STROOPS))" "$((10 * STROOPS))" "$((25 * STROOPS))" "$SHOP")
CEILINGS=$(printf '{"max_tx_limit":"%s","max_daily_limit":"%s"}' "$CEILING_TX" "$CEILING_DAILY")

echo "==> Deploying the agent account"
ACCOUNT=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/agent_account.wasm \
  --source-account cs-owner --network "$NET" \
  --alias "${ACCOUNT_ALIAS:-crimson-agent-account}" \
  -- \
  --owner "$OWNER" --owner_key "$OWNER_KEY" --agent_key "$AGENT_KEY" --token "$XLM" \
  --policy "$POLICY" --recovery "$RECOVERY" --ceilings "$CEILINGS")

echo "==> Funding the account with $FUNDING XLM"
stellar contract invoke --id "$XLM" --source-account cs-owner --network "$NET" \
  -- transfer --from "$OWNER" --to "$ACCOUNT" --amount $((FUNDING * STROOPS)) > /dev/null

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<EOF
ACCOUNT=$ACCOUNT
XLM=$XLM
OWNER=$OWNER
SHOP=$SHOP
RECOVERY=$RECOVERY
RELAYER=$RELAYER
AGENT_KEY=$AGENT_KEY
OWNER_KEY=$OWNER_KEY
CEILING_TX=$CEILING_TX
CEILING_DAILY=$CEILING_DAILY
EOF
echo
echo "Account: $ACCOUNT"
echo "https://stellar.expert/explorer/testnet/contract/$ACCOUNT"
stellar contract invoke --id "$ACCOUNT" --source-account cs-owner --network "$NET" --send=no -- get_status
