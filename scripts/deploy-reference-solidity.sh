#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
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

RPC_URL="${RH_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"

forge create OsmiumPolicyVault \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast
