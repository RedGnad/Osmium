# Demo Script

## 60-90 Second Judge Flow

Goal: prove that an AI finance agent can request a paid resource, but cannot
move funds unless the mandate, x402 challenge, PolicyEngine preview, settlement
router and receipt all line up.

1. Open the Osmium app.
2. Start on **Clear** and read the one-line claim:
   - `Agents request. Osmium clears.`
   - `Give agents clearance, not keys.`
3. Show the current mandate:
   - Agent: Market Data Agent
   - Asset/token: TSLA on Robinhood Chain Testnet
   - Resource: verified TSLA market data
   - Max amount: `0.25 TSLA`
   - Merchant: Verified Market Data API
   - Context: TSLA market-data only
4. Click through the clearance flow:
   - agent requests protected market data;
   - merchant returns `402 Payment Required`;
   - Osmium verifies the x402 payment requirements;
   - operator clearance is required before funds move;
   - router settles only after PolicyEngine approval;
   - merchant data unlocks with `paymentId + receiptHash`.
5. Open **Proofs**.
6. Show the proof matrix:
   - valid TSLA mandate -> `Cleared` with an on-chain tx;
   - replay -> `Denied / Replay`;
   - unknown merchant -> `Denied / UnknownMerchant`;
   - missing receipt -> `Denied / MissingReceipt`;
   - wrong context -> `Denied / ContextMismatch`;
   - over max amount -> `Denied / OverMaxTx`.
7. Say the proof boundary explicitly:
   - the valid row is the on-chain settlement transaction;
   - denial rows are PolicyEngine previews before settlement;
   - for pre-settlement denials, no funds moved.
8. Open **Build** or the README Merchant Kit section.
9. Show that an external merchant can protect a real endpoint:
   - `GET /market-data/TSLA` without clearance returns `402`;
   - valid `paymentId + receiptHash` returns `200 + data`;
   - missing receipt or wrong context never unlocks data.

## CLI Proof Path

Use this if a judge asks how the proof was generated:

```bash
pnpm agent:proofs
pnpm merchant:test
```

`pnpm agent:proofs` writes `proofs/latest-agent-clearance.json`. The final
public artifact must say:

```json
{
  "runner": "deployed-runner",
  "rows": [
    {
      "caseName": "Valid TSLA mandate",
      "proofType": "on-chain tx",
      "fundsMoved": true
    }
  ]
}
```

`pnpm merchant:test` starts the standalone TSLA merchant example and proves:

- no clearance -> `402 Payment Required`;
- missing receipt -> `402`, no unlock;
- invalid context -> `402`, no unlock;
- valid Osmium clearance -> `200`, data unlocked.

## Core Pitch

Osmium is the policy clearance layer for autonomous finance payments on
Robinhood Chain.

x402 lets agents request and pay for resources. Osmium proves whether the agent
was allowed to pay before funds move.

Short version:

> The agent tried to spend. Osmium cleared only the mandate-matching payment.
> Every unsafe attempt was denied before funds moved. The ledger proves it.
