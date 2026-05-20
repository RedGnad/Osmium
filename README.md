# Osmium

> A self-serve, x402-compatible **clearing layer for AI finance agents** on Robinhood Chain.

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

## Live demo

- App: **https://osmium-agent-runner.vercel.app**
- Runner API: https://osmium.onrender.com
- Chain: Robinhood Chain Testnet (`eip155:46630`)

The Clear screen runs the full loop:

```text
Request -> 402 -> Verify -> Clear -> Settle -> File -> Unlock   (replay denied)
```

A judge needs no wallet: open the app, stay in **Demo mode**, click through
Request → Verify → Clear and settle. The operator key is auto-loaded from the
runner. An optional "Blocked clearance proofs" section runs the denial cases
(unknown merchant, missing receipt, over-limit, replay) and files each in the
Settlement Ledger.

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

Most recent validated clearance case:

| Field | Value |
| --- | --- |
| Case | `OS-TSLA-402#5403F2` |
| Policy | `#2` · TSLA on Robinhood Chain Testnet |
| Settlement tx | `0x241d…3cab` |
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

## Limitations

- Testnet alpha — a hackathon prototype, not audited production infrastructure.
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

## Commands

```bash
forge build
forge test
pnpm agent:typecheck
pnpm web:build
pnpm sdk:typecheck
pnpm agent:live-settlement   # full onchain settlement proof
```

## More

- [`docs/architecture.md`](docs/architecture.md) — contracts, runner endpoints, settlement model, proof matrix, Stylus commands
- [`docs/deployment.md`](docs/deployment.md) — Vercel + runner environment setup
- [`docs/agent-runner.md`](docs/agent-runner.md) — runner service detail
- [`docs/threat-model.md`](docs/threat-model.md) — threat model
- [`docs/demo-script.md`](docs/demo-script.md) — demo walkthrough
