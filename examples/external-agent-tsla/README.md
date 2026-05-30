# External TSLA Agent Example

This example shows the client side of Osmium: an outside AI finance agent gets a
bounded mandate, asks for a protected TSLA resource, and can unlock it only with
an Osmium-filed receipt.

The agent is intentionally not the security boundary. It can choose a resource
and explain its action, but the runner, PolicyEngine, SettlementRouter and
merchant receipt gate decide whether data unlocks.

## Flow

1. Load `mandate.json`.
2. Start the standalone TSLA merchant from `examples/merchant-tsla-data`.
3. `GET /market-data/TSLA` without proof returns `402 Payment Required`.
4. Use a deployed-runner proof row with a real settlement tx.
5. Re-request the merchant with `paymentId + receiptHash`.
6. Verify unsafe paths do not unlock:
   - missing receipt;
   - wrong context;
   - fake payment id / fake receipt hash.

By default the example uses `proofs/latest-agent-clearance.json`, which must
come from `runner: "deployed-runner"` and include an on-chain tx for case A.
To capture a fresh settlement before running the demo, set:

```bash
EXTERNAL_AGENT_LIVE_SETTLE=true pnpm external-agent:demo
```

## Commands

```bash
pnpm external-agent:demo
pnpm external-agent:test
```

## Boundary

This is a hackathon reference integration. A production agent should fetch a
fresh x402 challenge, settle from its own configured lane, and treat Osmium's
PolicyEngine/SettlementRouter state as the source of truth.
