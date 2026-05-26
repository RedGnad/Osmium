# Osmium Merchant Kit

Minimal reference helper for merchants that want to protect a paid HTTP
resource with Osmium's x402-compatible clearance flow.

Osmium is not replacing your API. It adds one gate:

1. The agent requests a protected resource.
2. The merchant returns `402 Payment Required` with an Osmium payment challenge.
3. The agent asks Osmium to verify and settle.
4. The merchant unlocks only when `paymentId + receiptHash` are present.

This kit is deliberately small so providers can copy the shape into Express,
Next.js Route Handlers, Fastify, Hono, or MCP servers.

```ts
import { withOsmium402 } from "./src/withOsmium402";

const protectedTslaData = withOsmium402({
  resource: "market-data/TSLA",
  asset: "TSLA",
  price: "0.25",
  token: TSLA_ADDRESS,
  merchant: MERCHANT_ADDRESS,
  policyContext: "robinhood-market-data-v1"
});
```

Boundary: this helper creates the merchant-facing payment challenge. Osmium's
contracts and runner remain the security boundary for policy verification,
settlement, receipt filing and replay denial.
