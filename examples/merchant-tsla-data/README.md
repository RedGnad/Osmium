# TSLA Market Data Merchant Example

This example shows the smallest merchant-side integration:

- `GET /market-data/TSLA` without proof returns `402 Payment Required`.
- After Osmium settles and files a receipt, the same resource can unlock with
  `paymentId + receiptHash`.

The important product idea: the merchant does not trust the agent wallet. It
trusts Osmium's policy clearance result and filed receipt.

```ts
const protectedTslaData = withOsmium402({
  resource: "market-data/TSLA",
  asset: "TSLA",
  price: "0.25",
  token: TSLA_ADDRESS,
  merchant: MERCHANT_ADDRESS,
  policyContext: "robinhood-market-data-v1"
});
```

Run this as a reference when adapting an API, paid dataset, MCP server or
financial tool endpoint.

## Curl proof

```bash
# No Osmium clearance yet: the merchant returns an x402-compatible challenge.
curl -i http://localhost:3012/market-data/TSLA

# After Osmium clears + settles, paymentId and receiptHash unlock the resource.
curl -i "http://localhost:3012/market-data/TSLA?paymentId=0x...&receiptHash=0x..."

# Wrong-context attempts are denied before settlement by the PolicyEngine.
pnpm agent:attacks
```

The denial is intentionally labelled as a pre-settlement denial. No merchant
data unlocks and no funds move.
