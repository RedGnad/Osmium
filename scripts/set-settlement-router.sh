#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

ROUTER_ADDRESS="${1:-${OSMIUM_SETTLEMENT_ROUTER_ADDRESS:-}}"
if [[ -z "$ROUTER_ADDRESS" || "$ROUTER_ADDRESS" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "Usage: $0 <settlement-router-address>" >&2
  exit 1
fi

DEPLOYER_PRIVATE_KEY="${PRIVATE_KEY:-}"
if [[ -z "$DEPLOYER_PRIVATE_KEY" || "$DEPLOYER_PRIVATE_KEY" == "0x" ]]; then
  DEPLOYER_PRIVATE_KEY="${ADMIN_PRIVATE_KEY:-}"
fi
if [[ -z "$DEPLOYER_PRIVATE_KEY" || "$DEPLOYER_PRIVATE_KEY" == "0x" ]]; then
  DEPLOYER_PRIVATE_KEY="${AGENT_PRIVATE_KEY:-}"
fi

if [[ -z "$DEPLOYER_PRIVATE_KEY" || "$DEPLOYER_PRIVATE_KEY" == "0x" ]]; then
  echo "Missing PRIVATE_KEY, ADMIN_PRIVATE_KEY, or AGENT_PRIVATE_KEY env var" >&2
  exit 1
fi

if [[ "$DEPLOYER_PRIVATE_KEY" != 0x* ]]; then
  DEPLOYER_PRIVATE_KEY="0x$DEPLOYER_PRIVATE_KEY"
fi

if [[ -z "${OSMIUM_POLICY_ENGINE_ADDRESS:-}" || "$OSMIUM_POLICY_ENGINE_ADDRESS" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "Missing OSMIUM_POLICY_ENGINE_ADDRESS env var" >&2
  exit 1
fi

RPC_URL="${RH_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"

cast send "$OSMIUM_POLICY_ENGINE_ADDRESS" "setSettlementRouter(address)" "$ROUTER_ADDRESS" \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY"
