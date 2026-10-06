#!/usr/bin/env bash
# Deploys the Policy Vault to Stellar testnet and funds it with XLM.
#
#   bash scripts/deploy-testnet.sh
#
# Creates three local CLI identities (funded by Friendbot):
#   cs-owner  - owns the vault: sets policy, pauses, withdraws
#   cs-agent  - the AI agent: may only call `pay`
#   cs-shop   - the one allowlisted merchant
# The vault pays in native XLM through its Stellar Asset Contract.
#
# Optional environment overrides (used by scripts/demo-agente.sh so demo
# vaults never overwrite the official evidence):
#   AGENT_ID     identity of the agent            (default cs-agent)
#   VAULT_ALIAS  CLI alias for the new vault      (default crimson-vault)
#   OUT          file with the deployment ids     (default evidence/deployment.env)
#   RECOVERY_ADDRESS  public address that withdraw pays (default: identity cs-recovery)
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

NET=testnet
STROOPS=10000000 # 1 XLM
AGENT_ID=${AGENT_ID:-cs-agent}
VAULT_ALIAS=${VAULT_ALIAS:-crimson-vault}
OUT=${OUT:-evidence/deployment.env}

# Policy: 1-10 XLM per payment, 25 XLM per rolling 24h, 5 payments / 24h.
MIN_AMOUNT=$((1 * STROOPS))
TX_LIMIT=$((10 * STROOPS))
DAILY_LIMIT=$((25 * STROOPS))
MAX_PAYMENTS=5
VAULT_FUNDING=$((100 * STROOPS))

IDS=(cs-owner "$AGENT_ID" cs-shop)
[ -n "${RECOVERY_ADDRESS:-}" ] || IDS+=(cs-recovery)
for id in "${IDS[@]}"; do
  if ! stellar keys address "$id" >/dev/null 2>&1; then
    echo "==> Creating and funding identity $id"
    stellar keys generate "$id" --network "$NET" --fund
  fi
done

OWNER=$(stellar keys address cs-owner)
AGENT=$(stellar keys address "$AGENT_ID")
SHOP=$(stellar keys address cs-shop)
RECOVERY=${RECOVERY_ADDRESS:-$(stellar keys address cs-recovery)}
XLM=$(stellar contract id asset --asset native --network "$NET")

echo "==> Building"
stellar contract build

echo "==> Deploying Policy Vault"
POLICY=$(printf '{"min_amount":"%s","tx_limit":"%s","daily_limit":"%s","max_payments_per_day":%s,"allowlist":["%s"]}' \
  "$MIN_AMOUNT" "$TX_LIMIT" "$DAILY_LIMIT" "$MAX_PAYMENTS" "$SHOP")
VAULT=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/policy_vault.wasm \
  --source-account cs-owner \
  --network "$NET" \
  --alias "$VAULT_ALIAS" \
  -- \
  --owner "$OWNER" --agent "$AGENT" --token "$XLM" --policy "$POLICY" --recovery "$RECOVERY")

echo "==> Funding vault with $((VAULT_FUNDING / STROOPS)) XLM"
stellar contract invoke --id "$XLM" --source-account cs-owner --network "$NET" \
  -- transfer --from "$OWNER" --to "$VAULT" --amount "$VAULT_FUNDING"

cat > "$OUT" <<EOF
VAULT=$VAULT
XLM=$XLM
OWNER=$OWNER
AGENT=$AGENT
SHOP=$SHOP
RECOVERY=$RECOVERY
EOF

echo
echo "Vault:  $VAULT"
echo "Owner:  $OWNER"
echo "Agent:  $AGENT"
echo "Shop:   $SHOP"
echo "Explorer: https://stellar.expert/explorer/testnet/contract/$VAULT"
echo
stellar contract invoke --id "$VAULT" --source-account cs-owner --network "$NET" --send=no -- get_status
