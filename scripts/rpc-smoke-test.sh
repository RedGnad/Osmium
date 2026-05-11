#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RH_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"

echo "Robinhood chain id:"
curl -s -X POST "$RPC_URL" \
  -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
echo

echo "ArbWasm precompile code:"
curl -s -X POST "$RPC_URL" \
  -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":2,"method":"eth_getCode","params":["0x0000000000000000000000000000000000000071","latest"]}'
echo

echo "ArbWasmCache precompile code:"
curl -s -X POST "$RPC_URL" \
  -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":3,"method":"eth_getCode","params":["0x0000000000000000000000000000000000000072","latest"]}'
echo

