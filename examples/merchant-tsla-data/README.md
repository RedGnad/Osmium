# TSLA Market Data Merchant Example

This example shows the smallest merchant-side integration:

- `GET /market-data/TSLA` without proof returns `402 Payment Required`.
- After Osmium settles and files a receipt, the same resource can unlock with
  `paymentId + receiptHash`.
- Wrong context or missing receipt never unlocks data.

The important product idea: the merchant does not trust the agent wallet. It
trusts Osmium's policy clearance result and filed receipt.

```ts
const protectedTslaData = withOsmium402({
  resource: "market-data/TSLA",
  asset: "TSLA",
  price: "0.25",
  token: TSLA_ADDRESS,
  merchant: MERCHANT_ADDRESS,
  policyContext: "robinhood-market-data-v1",
  runnerUrl: process.env.OSMIUM_RUNNER_URL
});
```

Run this as a reference when adapting an API, paid dataset, MCP server or
financial tool endpoint.

## Required env

```bash
OSMIUM_RUNNER_URL=https://osmium-agent-runner.vercel.app/api/runner
MERCHANT_ADDRESS=0x000000000000000000000000000000000000beef
TSLA_ADDRESS=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
PORT=3012
```

## Run

```bash
pnpm merchant:demo
pnpm merchant:test
```

## Curl proof

```bash
# No Osmium clearance yet: the merchant returns an x402-compatible challenge.
curl -i http://localhost:3012/market-data/TSLA

# After Osmium clears + settles, paymentId and receiptHash unlock the resource.
curl -i "http://localhost:3012/market-data/TSLA?paymentId=0x...&receiptHash=0x..."

# Wrong-context attempts do not unlock merchant data.
curl -i "http://localhost:3012/market-data/TSLA?paymentId=0x...&receiptHash=0x...&policyContext=amzn-corporate-action-v1"
```

Merchant unlock failures are intentionally not described as mined denial
transactions. Missing receipt or wrong context returns a 402 challenge again:
no merchant data unlocks.
