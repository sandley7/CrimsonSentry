#!/usr/bin/env bash
# Runs cargo scout-audit (CoinFabrik) on a contract: the Policy Vault by default.
# Linux/WSL/macOS only.
#
#   cargo install --locked cargo-dylint dylint-link cargo-scout-audit@0.3.16   # once
#   bash scripts/scout.sh                                                       # the vault -> docs/scout-report.md
#   bash scripts/scout.sh contracts/agent-account docs/scout-report-agent-account.md
#
# Two workarounds for scout 0.3.16 + soroban-sdk 28 (neither touches the contract):
#  1. `--target=<host>`: scout otherwise forces wasm32-unknown-unknown, which
#     soroban-sdk refuses to build with Rust >= 1.82. The detectors analyse
#     the source (MIR), so the host target gives the same findings.
#  2. RUSTC_WRAPPER: scout's pinned nightly-2025-08-07 predates Rust 1.91,
#     where str::floor_char_boundary (used by soroban-sdk-macros) became
#     stable; the wrapper enables that feature for that one crate only.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
CRATE=${1:-contracts/policy-vault}
REPORT=${2:-docs/scout-report.md}
chmod +x scripts/scout-rustc-wrap.sh
cd "$CRATE"
RUSTC_WRAPPER="$ROOT/scripts/scout-rustc-wrap.sh" cargo scout-audit \
  --output-format md --output-path "$ROOT/$REPORT" \
  -- --target="$(rustc -vV | sed -n 's/^host: //p')"
# Scout emits source links relative to the repository root; the report lives
# in docs/, so make them relative to it (from PR #2).
sed -i 's#](contracts/#](../contracts/#g' "$ROOT/$REPORT"
