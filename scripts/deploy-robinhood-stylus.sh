#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "Missing PRIVATE_KEY env var" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_URL="${RH_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"

cd "$ROOT/contracts/osmium-stylus"

echo "Deploying Osmium Stylus PolicyEngine to Robinhood Chain Testnet..."
cargo stylus deploy --endpoint "$RPC_URL" --private-key "$PRIVATE_KEY"

