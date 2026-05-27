# Osmium Merchant Kit

Minimal reference helper for merchants that want to protect a paid HTTP
resource with Osmium's x402-compatible clearance flow.

This is a hackathon reference kit, not a published npm package yet. It shows
how third-party API, data, tool and MCP providers can protect paid endpoints
with Osmium clearance.

Osmium is not replacing your API. It adds one gate:

1. The agent requests a protected resource.
2. The merchant returns `402 Payment Required` with an Osmium payment challenge.
3. The agent asks Osmium to verify and settle.
4. The merchant unlocks only when `paymentId + receiptHash` are present.

This kit is deliberately small so providers can copy the shape into Express,
Next.js Route Handlers, Fastify, Hono, or MCP servers.

## Integrate Osmium in 20 lines

Required env for an external merchant app:

```bash
OSMIUM_RUNNER_URL=https://osmium-agent-runner.vercel.app/api/runner
MERCHANT_ADDRESS=0x000000000000000000000000000000000000beef
TSLA_ADDRESS=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
PORT=3012
```

```ts
import { withOsmium402 } from "./src/withOsmium402";

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

Boundary: this helper creates the merchant-facing payment challenge. Osmium's
contracts and runner remain the security boundary for policy verification,
settlement, receipt filing and replay denial.

## Curl proof

```bash
# 1. No clearance -> 402 Payment Required.
curl -i http://localhost:3012/market-data/TSLA

# 2. Valid Osmium clearance -> 200 + data.
curl -i "http://localhost:3012/market-data/TSLA?paymentId=0x...&receiptHash=0x..."

# 3. Invalid context -> denied / no unlock.
curl -i "http://localhost:3012/market-data/TSLA?paymentId=0x...&receiptHash=0x...&policyContext=amzn-corporate-action-v1"
```

Run the standalone proof:

```bash
pnpm merchant:demo
pnpm merchant:test
```

Roadmap: publish the package, add merchant API keys, self-serve merchant
registry, and richer discovery metadata.
