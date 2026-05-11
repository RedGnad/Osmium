#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_URL="${RH_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"

cd "$ROOT/contracts/osmium-stylus"

echo "Checking Osmium Stylus contract against Robinhood Chain Testnet..."
echo "RPC: $RPC_URL"
cargo stylus check --endpoint "$RPC_URL"

