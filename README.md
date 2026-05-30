# Osmium

> Osmium is the policy clearance layer for autonomous finance payments on Robinhood Chain.
> x402 lets agents pay. Osmium proves they were allowed to.

**Agents request. Osmium clears. The router settles. The ledger proves.**

A normal agent wallet hands an LLM a private key and hopes for the best:

```text
LLM -> private key -> direct transfer
```

Osmium puts a policy-aware clearing layer in front of the funds:

```text
agent intent -> SettlementRouter -> Stylus PolicyEngine -> allow / deny -> settlement + receipt
```

The agent can request a paid resource, but it cannot move funds until an
onchain policy verifies merchant, token, amount, receipt, intent/context, and
replay protection — and a clearance step authorises settlement.

## What is Osmium?

The wedge is narrow on purpose. Osmium is **not** an AI wallet and **not** a
generic treasury firewall. It is the clearing layer for a specific user:

> A team building an AI finance agent that needs to pay for data, APIs, MCP
> tools, or tokenized-asset services — without handing the agent an
> unrestricted wallet.

The first workflow is an agent buying verified market data around Robinhood
stock tokens. TSLA is the live settlement proof; the same policy model covers
AMD, AMZN, PLTR, NFLX.

**Give agents clearance, not keys.**

## What Osmium proves

Osmium proves that an autonomous finance payment matched a bounded mandate
before funds moved:

- the agent was authorised by the policy;
- the merchant was verified;
- the token and amount were allowed;
- the payment intent was bound to the expected context;
- a receipt was required and filed;
- the same `paymentId` could not settle twice.

The LLM can choose and explain. It is never the security boundary. The
`PolicyEngine` and `SettlementRouter` decide whether value can move.

## Threats blocked

| Threat | Expected result |
| --- | --- |
| Valid TSLA mandate | cleared |
| Replay same `paymentId` | denied |
| Unknown merchant | denied |
| Missing `receiptHash` | denied |
| Wrong context, e.g. AMZN with TSLA mandate | denied |
| Over max amount / budget | denied |

## Live demo

- App: **https://osmium-agent-runner.vercel.app**
- Runner API: same-origin Vercel API (`/api/runner`, `/api/health`)
- Chain: Robinhood Chain Testnet (`eip155:46630`)

The Clear screen runs the clearance loop:

```text
Request -> 402 -> Verify -> Clear -> Settle -> File -> Unlock   (replay denied)
```

The Agent Console adds the agentic proof:

```text
mandate JSON -> agent chooses TSLA data -> 402 -> Osmium verify -> settle if cleared -> ledger row -> explanation
```

A judge needs no wallet: open the app, stay in **Demo mode**, click through
Request → Verify → Clear and settle. The operator key is auto-loaded from the
runner. An optional "Blocked clearance proofs" section runs the denial cases
(unknown merchant, missing receipt, over-limit, replay) and files each in the
Settlement Ledger.

## Agent loop

The runner exposes an agent loop for the demo path:

```text
GET  /agent/mandate   -> AP2-inspired mandate JSON
POST /agent/run       -> request paid TSLA data, verify, settle, unlock, explain
POST /agent/attacks   -> run valid + unsafe mandate attempts
POST /agent/proofs    -> compact judge proof matrix
```

The loop is deliberately narrow. The first resource is TSLA market data. The
agent can describe why it asks for the resource, but only Osmium can clear the
payment.

## Mandate schema

```json
{
  "agent": "0x...",
  "asset": "TSLA",
  "resource": "market-data",
  "merchant": "0x...",
  "token": "0x...",
  "maxAmount": "0.25",
  "periodLimit": "3.00",
  "validUntil": "2026-05-26T12:00:00.000Z",
  "purpose": "Buy verified TSLA market data only",
  "contextHash": "0x...",
  "intentHash": "0x..."
}
```

This is an **AP2-inspired mandate model**, not an AP2 compliance claim.

## Self-Serve Alpha

Self-serve mode is the builder path. The connected wallet is fully sovereign
over its own workspace — four onchain steps, one time:

1. `createPolicy(agent=self, token=TSLA, maxPerTx, periodLimit, validUntil)` — the wallet becomes the policy owner.
2. `approveIntent(policyId, intentHash, contextHash, max, validUntil)` — authorises Osmium's x402 intent on that policy.
3. `TSLA.approve(SettlementRouter, allowance)` — one-time token approval.
4. `SettlementRouter.deposit(TSLA, amount)` — funds the user's own vault.

After provisioning, each clearance is one wallet popup —
`SettlementRouter.settleWithIntent(...)` signed by the user. The runner does
**not** sign; it observes the resulting transaction via `/x402/settle/observe`
and ingests the audit row from on-chain truth. Workspace identifiers persist in
`localStorage`, so a returning operator skips straight to settling.

Test TSLA comes from the [Robinhood Chain faucet](https://faucet.testnet.chain.robinhood.com)
(5 stock tokens + gas per address per 24h).

## Demo lane vs self-serve lane

| | Demo lane | Self-serve lane |
| --- | --- | --- |
| Audience | Judges / quick proof | Agent builders |
| Wallet connect | not required | required |
| Vault | team-funded | user-funded |
| Settlement signer | runner (operator key) | the user's wallet |
| Policy | Osmium-managed `#2` | user-created onchain |
| Custody | partially custodial | **non-custodial** |

Both lanes share the same x402 envelope, the same `PolicyEngine`, and the same
`SettlementRouter`. Only the signer differs. `/x402/supported` advertises only
the `osmium-exact` scheme.

## Live proof

The public app includes a **Proofs** tab (`/proofs`) that shows the latest
judge-facing matrix:

| Case | Expected result | Honest proof type |
| --- | --- | --- |
| Valid TSLA mandate | Cleared | on-chain tx when live capture runs |
| Replay same `paymentId` | Denied / Replay | pre-settlement denial |
| Unknown merchant | Denied / UnknownMerchant | pre-settlement denial |
| Missing `receiptHash` | Denied / MissingReceipt | pre-settlement denial |
| Wrong context | Denied / ContextMismatch | pre-settlement denial |
| Over max amount | Denied / OverMaxTx | pre-settlement denial |

Latest generated artifact:

- [`proofs/latest-agent-clearance.json`](proofs/latest-agent-clearance.json)

Most recent validated clearance case:

| Field | Value |
| --- | --- |
| Case | Valid TSLA mandate |
| Policy | `#2` · TSLA on Robinhood Chain Testnet |
| Settlement tx | `0xc49c…3120` |
| Result | Cleared · Filed · **Replay denied** · Data unlocked |

Earlier full-hash live TSLA settlement run:

- Settled payment tx: `0x637497c49897bb01ff1010cb83ad50eab4ff43b15a9f305e497445f120c6d6c2`
- Payment id: `0xb42aeba10ad5bec6c35c208f2908da26010bdc3ede9c5fb3a37a91b57111f4f0`
- Receipt hash: `0xf79b4a7a5343f9d9f1faa0eb9d0069125c63bdc1aecd03c903d0209d8305bca3`
- Amount: `0.25 TSLA` · replay check after settlement: `Replay`

Deployed contracts:

- Stylus `PolicyEngine`: `0x5e30622c7639aa5edc43313830c9a01341585728`
- Solidity `SettlementRouter`: `0x1CD04cbD3348D5fa28B30776902464752e878ac7`

Reproduce the full onchain proof locally:

```bash
pnpm agent:live-settlement
```

It prints owner/router/merchant balances before and after, the
approve/deposit/settle tx hashes, the stored PolicyEngine receipt, and a replay
preview returning `reasonName: "Replay"`.

## x402 compatibility

Osmium exposes an x402-compatible resource + facilitator surface:

```text
GET  /merchant/market-data?asset=TSLA   -> 402 Payment Required + PAYMENT-REQUIRED header
POST /x402/verify                       -> read-only PolicyEngine preview
POST /x402/settle                       -> SettlementRouter settlement + PAYMENT-RESPONSE header
```

**Why not the Coinbase CDP facilitator?** CDP only routes a fixed network
allowlist (Base, Polygon, Arbitrum, World, Solana) and settles via
EIP-3009/Permit2 on the buyer wallet. Robinhood Chain is not on that allowlist,
and buyer-wallet settlement is incompatible with Osmium's delegated-vault
model. The x402 protocol is permissionless, so Osmium self-hosts a custom
x402-compatible facilitator for `eip155:46630`: same HTTP envelope, same
`accepts[]` shape, different settlement primitive (`osmium-delegated-vault`).
The `PaymentRequirements.extra.compatibility` field declares this divergence
explicitly so x402-aware clients can opt in or fall through.

## Merchant kit

`merchant-kit/` contains the smallest reusable merchant helper:

```ts
withOsmium402({
  resource: "market-data/TSLA",
  asset: "TSLA",
  price: "0.25",
  token: TSLA_ADDRESS,
  merchant: MERCHANT_ADDRESS,
  policyContext: "robinhood-market-data-v1",
  runnerUrl: process.env.OSMIUM_RUNNER_URL
});
```

`merchant-kit/` is a hackathon reference kit, not a published npm package yet.
It demonstrates how third-party API, data, tool and MCP providers can protect
paid endpoints with Osmium clearance.

`examples/merchant-tsla-data/` is a standalone merchant app. It returns
`402 Payment Required` until the agent presents a valid Osmium
`paymentId + receiptHash`, and wrong context or missing receipt never unlocks
the protected data.

Protect an API with Osmium in 20 lines:

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

Required env for external apps:

```bash
OSMIUM_RUNNER_URL=https://osmium-agent-runner.vercel.app/api/runner
MERCHANT_ADDRESS=0x000000000000000000000000000000000000beef
TSLA_ADDRESS=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
PORT=3012
```

Curl shape:

```bash
# 1. No clearance -> 402 Payment Required
curl -i http://localhost:3012/market-data/TSLA

# 2. Valid Osmium clearance -> 200 + data
curl -i "http://localhost:3012/market-data/TSLA?paymentId=0x...&receiptHash=0x..."

# 3. Invalid context -> denied / no unlock
curl -i "http://localhost:3012/market-data/TSLA?paymentId=0x...&receiptHash=0x...&policyContext=amzn-corporate-action-v1"
```

Standalone proof:

```bash
pnpm merchant:demo
pnpm merchant:test
```

Production roadmap: publish the merchant kit, add merchant API keys,
self-serve merchant registry, and richer discovery metadata.

The policy attack-mode invalid-context case is intentionally not a merchant 500
and not a vague LLM refusal. It is a PolicyEngine verdict: `ContextMismatch`,
no funds moved.

## External agent example

`examples/external-agent-tsla/` shows the other side of the integration: a
builder-owned agent receives a bounded TSLA mandate, requests the standalone
merchant resource, and can unlock data only with an Osmium-filed receipt.

```bash
pnpm external-agent:demo
pnpm external-agent:test
```

The test proves:

- no clearance -> `402 Payment Required`;
- missing receipt -> no unlock;
- wrong context -> no unlock;
- fake `paymentId + receiptHash` -> no unlock;
- valid Osmium receipt -> `200 + data`.

The agent can decide and explain. It cannot bypass Osmium because the merchant
checks `paymentId + receiptHash` against the runner and the runner anchors the
receipt to onchain settlement.

## Production-oriented testnet deployment

Osmium is positioned as a production-oriented testnet deployment, not audited
mainnet infrastructure. The submission package includes:

- deployed Robinhood Chain Testnet contracts;
- same-origin Vercel runner API with Turso audit persistence;
- public proof matrix with one live TSLA settlement row;
- external merchant reference kit and standalone TSLA merchant test;
- external agent reference integration;
- explicit trust boundaries, access control and audit scope docs;
- deployment manifest at `deployments/robinhood-testnet.json`.

Mainnet hardening path: independent audit, multisig/timelock operations,
scoped runner keys, merchant onboarding/KYB, durable indexer, package publishing
and richer service discovery metadata.

## What is on-chain / off-chain / simulated

| Layer | Status |
| --- | --- |
| Stylus `PolicyEngine` | on-chain, Robinhood Chain Testnet |
| Solidity `SettlementRouter` | on-chain, Robinhood Chain Testnet |
| TSLA settlement | live testnet token movement |
| x402 facilitator | custom Osmium-compatible runner |
| Merchant receipts | EIP-712 typed data, service-signed when signer env exists |
| Audit ledger | Vercel runner + Turso/JSON fallback, onchain tx is source of truth |
| AP2 mandate | inspired model for demo clarity, not AP2 compliance |

## Limitations

- Testnet alpha — production-oriented testnet deployment, not audited production
  infrastructure.
- `osmium-exact` is a custom Osmium facilitator. It is x402-compatible at the
  HTTP layer; it does not claim CDP facilitator support.
- AMD / AMZN are quote-supported service proofs; only TSLA has live settlement.
- Policy templates beyond TSLA-strict, a custom policy editor, workspace API
  keys, and a merchant SDK package are roadmap — shown in the UI as visibly
  disabled "coming soon" surfaces, never as working features.
- The demo vault is finite team-funded testnet TSLA; it is refilled manually.
  Self-serve operators are unaffected — they fund their own vault.
- Merchant receipts include EIP-712 typed data and can be service-signed; they
  do not independently verify offchain service quality.

## Judge checklist

- Deployed on Robinhood Chain Testnet (`eip155:46630`).
- Stylus `PolicyEngine` live.
- Solidity `SettlementRouter` live.
- Agent loop live: mandate -> TSLA paid-data request -> x402 -> Osmium clearance.
- Valid settlement proof available in the Proofs tab and JSON artifact.
- Six attack cases visible: valid, replay, unknown merchant, missing receipt,
  wrong context, over max.
- Merchant kit included with a standalone protected TSLA endpoint example.
- Merchant kit clearly labelled as a hackathon reference kit, not a published
  npm package.
- Third-party provider path demonstrated: no clearance -> 402, valid clearance
  -> 200 + data, missing receipt / wrong context -> no unlock.
- External agent path demonstrated: mandate -> protected merchant -> Osmium
  receipt -> data unlock, with fake proof blocked.
- Security docs included: trust boundaries, threat model, access control, audit
  scope.
- Deployment manifest included for Robinhood Chain Testnet.
- On-chain: policy checks, settlement, receipts/replay in contracts.
- Off-chain: merchant resource, EIP-712 service receipt, audit display.
- Simulated/demo-grade: AP2-inspired mandate, custom x402-compatible
  facilitator, testnet operator lane, JSON/Turso audit store.
- Known limitations are shown; Osmium does not claim full AP2 compliance or
  Coinbase CDP facilitator support on Robinhood Chain.

## Commands

```bash
forge build
forge test
pnpm agent:typecheck
pnpm web:build
pnpm sdk:typecheck
pnpm agent:live-settlement   # full onchain settlement proof
pnpm agent:attacks           # valid mandate + blocked attempt smoke test
pnpm agent:proofs            # write proofs/latest-agent-clearance.json
pnpm merchant:test           # external merchant proof
pnpm external-agent:test     # external agent proof
```

## More

- [`docs/architecture.md`](docs/architecture.md) — contracts, runner endpoints, settlement model, proof matrix, Stylus commands
- [`docs/deployment.md`](docs/deployment.md) — Vercel + runner environment setup
- [`docs/agent-runner.md`](docs/agent-runner.md) — runner service detail
- [`docs/threat-model.md`](docs/threat-model.md) — threat model
- [`docs/demo-script.md`](docs/demo-script.md) — demo walkthrough
- [`security/TRUST_BOUNDARIES.md`](security/TRUST_BOUNDARIES.md) — onchain/offchain/agent boundaries
- [`security/ACCESS_CONTROL.md`](security/ACCESS_CONTROL.md) — role table and production plan
- [`security/AUDIT_SCOPE.md`](security/AUDIT_SCOPE.md) — future audit scope
- [`deployments/robinhood-testnet.json`](deployments/robinhood-testnet.json) — live deployment manifest
