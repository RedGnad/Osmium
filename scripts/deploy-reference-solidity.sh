#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "Missing PRIVATE_KEY env var" >&2
  exit 1
fi

RPC_URL="${RH_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"

forge create OsmiumPolicyVault \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast

