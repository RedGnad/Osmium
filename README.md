# Osmium

Onchain SpendOps for AI finance agents on Arbitrum and Robinhood Chain.

Osmium lets builders of AI finance agents enforce deterministic onchain spending policies before agents can settle tokenized-asset payments. An agent can only move assets through policies enforced onchain: verified merchants, token constraints, max transaction size, rolling budgets, receipt hashes, replay protection, and auditable blocked-risk events.

Normal agent wallet:

```text
LLM -> private key -> direct transfer
```

Osmium:

```text
Agent intent -> SettlementRouter -> Stylus PolicyEngine -> allow / deny -> settlement + receipt
```

## Positioning

Osmium is not a generic treasury execution firewall and it is not an AI wallet. The wedge is narrower:

> Onchain SpendOps for AI finance agents on Robinhood Chain.

The primary user is a builder or operator running an AI finance agent that needs to pay for data, APIs, MCP tools, or services without receiving unrestricted wallet authority. The first workflow is an AI finance agent buying verified services around Robinhood stock tokens. Osmium enforces merchant, token, amount, receipt, budget, context, and replay constraints before settlement can move funds.

The demo keeps one clear workflow but shows multi-asset capability: TSLA is the live settlement proof, while the same policy model supports Robinhood test assets such as AMD, AMZN, PLTR, and NFLX.

## Hackathon Target

- Event: Arbitrum Open House London Online Buildathon
- Primary track: Best Agentic Project
- Primary chain: Robinhood Chain Testnet
- Secondary chain: Arbitrum Sepolia
- Core technology: Arbitrum Stylus / Rust, with Solidity fallback and mocks for fast testing

## MVP Surface

1. `SpendOps Console`: operators see overview, agents, policies, merchants, live spend, audit state, and developer integration.
2. `SettlementRouter`: user deposits funds and settlement only happens after policy approval.
3. `PolicyEngine`: deterministic onchain checks before funds move.
4. `Merchant API`: a verified market-data service returns quotes, receipt hashes, and unlocks data after settlement proof.
5. `MerchantRegistry`: allowlisted merchants with category and metadata hashes.
6. `ReceiptGate`: payment requires a receipt hash and unique payment id.
7. `RiskEvents`: blocked attempts emit explicit events instead of silently failing.

## Current Implementation

The sponsor-native core is the Stylus policy engine:

- `contracts/osmium-stylus/src/lib.rs`
- `deployments/OsmiumPolicyEngine.sol`

The Solidity reference implementation and demo token are:

- `contracts/solidity/src/OsmiumPolicyVault.sol`
- `contracts/solidity/src/OsmiumSettlementRouter.sol`
- `contracts/solidity/src/MockERC20.sol`

The Solidity contracts are useful for fast local tests, ERC20 custody, and Stylus/Solidity settlement interop. The Stylus contract is the Robinhood/Arbitrum-native policy engine.

## Live Deployments

Robinhood Chain Testnet:

- Stylus `PolicyEngine`: `0x5e30622c7639aa5edc43313830c9a01341585728`
- Solidity `SettlementRouter`: `0x1CD04cbD3348D5fa28B30776902464752e878ac7`
- PolicyEngine deployment tx: `0x344c48bff7e6852220491d50003d38218ec439a3dc4c4a6f69b5f6d36223ec80`
- PolicyEngine activation tx: `0x810bd4ddb6a6b911c9708a922580d1e3c7887d9b004ca40fbc4f3f4bb86ace3a`
- SettlementRouter deployment tx: `0x43a1e173603e7664ec60ecaa9f95518a1be202dab42dfa2a45779759a93cf323`
- Set settlement router tx: `0x2b1390cb22a8320fdf39536466659b0a5279184db2385f8078afe68a6a46e770`
- Init tx: `0x59c997c90e04be6e60720a985f081b9e419872825c4b0fc397e3acecf9541efb`
- Register USDG merchant tx: `0xc1eeff08b27ac79ec50fadee760fb5d67db115a7babd182d8b31c1ce72ab1925`
- Create USDG policy tx: `0xb6db4ec1555bb23d0986c4f7639defb4dba3ca5b9223eb66a7e280ec65ce74ed`
- Approve USDG intent tx: `0xc1d1769151d8633d2d816f198d58951877a09f25f7a4750f02bfbe064e000368`
- USDG policy id: `1`
- Active TSLA demo policy id: `2`
- Settlement demo policy id: `2`
- Demo merchant: `0x000000000000000000000000000000000000beef`
- Demo token/USDG: `0x7E955252E15c84f5768B83c41a71F9eba181802F`
- Settlement demo token/TSLA: `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`

The live deployed engine proves Stylus-native authorization, runtime context enforcement, receipts, replay protection, and audit events. The live `OsmiumSettlementRouter` adds real ERC20 custody and settlement in Solidity against the Stylus engine interface. The router is registered on the engine with `setSettlementRouter`.

The offchain demo components are:

- `apps/agent-runner`: Express service for local/Render agent execution.
- `apps/web`: Vite/React firewall dashboard.
- `docs/deployment.md`: Vercel frontend and runner environment setup.

The runner also exposes a mini verified merchant surface:

- `GET /merchant/quote?asset=TSLA`
- `GET /merchant/quote?asset=AMD`
- `GET /merchant/quote?asset=AMZN`
- `POST /merchant/receipt`
- `GET /merchant/market-data?asset=TSLA`
- `GET /x402/supported`
- `POST /x402/verify`
- `POST /x402/settle`

This turns the demo from "agent sends a token" into "agent buys a verified Robinhood agent service, settles through Osmium, then unlocks data with a receipt proof."

The demo merchant exposes a small Robinhood Agent Services pack:

| Resource | Asset | Status |
| --- | --- | --- |
| Market data snapshot | `TSLA` | Live settlement proof |
| Risk snapshot | `AMD` | Quote-supported service proof |
| Corporate-action alert | `AMZN` | Quote-supported service proof |

Osmium now implements an x402-compatible resource and facilitator surface for Robinhood Chain delegated settlement:

```text
GET /merchant/market-data?asset=TSLA
  -> 402 Payment Required
  -> PAYMENT-REQUIRED header
  -> scheme: osmium-exact
  -> network: eip155:46630

POST /x402/verify
  -> read-only PolicyEngine preview

POST /x402/settle
  -> operator-protected SettlementRouter settlement
  -> PAYMENT-RESPONSE header
```

This is not the Coinbase CDP facilitator on Robinhood Chain. It is a custom policy-aware x402-compatible facilitator for Osmium's delegated vault model: the operator funds a router vault, the agent requests a paid resource, the facilitator verifies the Osmium policy, and settlement moves through the `OsmiumSettlementRouter`.

## Merchant-Signed Receipts

Osmium returns an EIP-712 `MerchantReceipt` attestation when a protected merchant resource unlocks. The receipt binds:

- merchant and agent;
- policy id and chain id;
- token asset and amount;
- resource id and response hash;
- payment id and settlement transaction hash;
- expiry.

If `MERCHANT_RECEIPT_SIGNER_PRIVATE_KEY` is configured on the runner, the merchant service signs the typed data and the response includes `merchantReceipt.signature`, `expectedSigner`, `recoveredSigner`, and `verified: true`. If it is not configured, the runner still returns the typed data in `unsigned-demo` mode so judges can inspect exactly what the merchant would sign without exposing a secret in the repo.

This does not claim to verify the economic quality of offchain data. It upgrades the old receipt-hash boundary into a signed service attestation that proves which merchant resource was unlocked for which settlement.

Final submission target: the hosted runner should use a configured merchant receipt signer, and the UI should show `EIP-712 signed + verified` after a TSLA settlement unlock. Do not use `unsigned-demo` in the final video.

## Onchain Proof Matrix

| Scenario | Expected result | Proof surface |
| --- | --- | --- |
| Verified merchant + valid receipt | Settled | `PaymentSettled`, merchant balance delta, filed receipt |
| Replay payment id | Denied | Policy preview returns `Replay` |
| Unknown merchant | Denied | Policy preview returns `UnknownMerchant` |
| Missing receipt | Denied | Policy preview returns `MissingReceipt` |
| Over max payment | Denied | Policy preview returns `OverMaxTx` |
| Context mismatch | Denied | Stylus intent/context binding returns `ContextMismatch` |
| Wrong token | Denied | Router policy token check / policy preview |

Developer integration starts in `packages/osmium-sdk`:

```ts
import { OsmiumClient } from "@osmium/sdk";

const osmium = new OsmiumClient({ runnerUrl: "https://your-runner.example" });
const quote = await osmium.getQuote("TSLA");
const previews = await osmium.previewSpend();
const required = await osmium.getPaymentRequired("TSLA");
const payload = osmium.createPaymentPayload(required);
const verification = await osmium.verifyX402({ paymentRequired: required, paymentPayload: payload });
```

Operator-only execution can pass `operatorApiKey` server-side or in a local judged console session. Do not embed it in public frontend environment variables.

## Robinhood Chain Testnet

- Chain ID: `46630`
- Public RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`
- Faucet: `https://faucet.testnet.chain.robinhood.com`

The public RPC is rate-limited. For deployment and activation, set `RH_RPC_URL` in `.env` to an Alchemy or QuickNode Robinhood Testnet endpoint.

Useful testnet assets include `USDG`, `WETH`, and stock tokens like `TSLA`, `AMZN`, `PLTR`, `NFLX`, and `AMD`.

### Why not the CDP facilitator?

The Coinbase CDP-hosted x402 facilitator only routes a fixed allowlist of networks (Base, Polygon, Arbitrum, World, Solana). Robinhood Chain testnet (`eip155:46630`) is not on that allowlist, and the CDP facilitator settles via EIP-3009/Permit2 on the buyer wallet — incompatible with Osmium's delegated-vault model.

The x402 protocol is permissionless, so Osmium self-hosts a custom x402-compatible facilitator for `eip155:46630`. Same HTTP envelope, same `accepts[]` shape, different settlement primitive (`osmium-delegated-vault` instead of `permit2-witness-transfer`). The PaymentRequirements `extra.compatibility` field declares this divergence explicitly so x402-aware clients can opt in or fall through.

## Self-Serve Alpha

The Clear screen ships in two coexisting modes, controlled by a toggle above the Clearance Ticket:

**Demo mode** — the judge path. No wallet connect required. An operator API key paste authorises the runner to settle from the team-funded TSLA vault. This path always remains accessible.

**Self-serve mode** — the builder path. The connected wallet is fully sovereign over its own workspace:

1. `policyEngine.createPolicy(agent=self, token=TSLA, maxPerTx, periodLimit, validUntil)` — msg.sender becomes the policy owner.
2. `policyEngine.approveIntent(policyId, intentHash, contextHash, max, validUntil)` — authorises Osmium's canonical x402 intent on the user's policy.
3. `TSLA.approve(SettlementRouter, allowance)` — one-time approval.
4. `SettlementRouter.deposit(TSLA, amount)` — funds the user's own vault (`vaultBalance[wallet][TSLA]`).

After provisioning, each clearance is one wallet popup: `SettlementRouter.settleWithIntent(policyId, …)` signed by the user's wallet. Osmium's runner does **not** sign the settlement; it observes the resulting transaction via `POST /x402/settle/observe` and ingests the audit row from on-chain truth.

Workspace identifiers persist in `localStorage` keyed by wallet address — a returning user skips straight to settling.

**What's testnet vs. production today:**

| Surface | State |
|---|---|
| Robinhood Chain Testnet (eip155:46630) | live |
| OsmiumPolicyEngine — Stylus, deployed | live |
| OsmiumSettlementRouter — Solidity, deployed | live |
| Demo mode (operator-key + team vault) | live |
| Self-serve mode (wallet + own vault) | live, testnet-only |
| Policy templates other than TSLA-strict | coming soon |
| Custom policy editor | coming soon |
| Workspace API keys / hosted control plane | V2 |
| Merchant SDK npm package | V2 |
| AMD/AMZN live settlement | quote-supported only |

The "coming soon" surfaces appear in the UI as visibly disabled cards. They are not clickable and do not pretend to function.

**Custodial boundary:**

- Demo mode is **partially custodial** — the team's runner holds the spend key for the team's vault. Users observe; they do not custody anything.
- Self-serve mode is **non-custodial** — the user holds the funds, signs every settlement, and can withdraw at any time via `SettlementRouter.withdraw(TSLA, amount)`. Osmium never has spend authority over the user's vault.

`/x402/supported` continues to advertise only the `osmium-exact` scheme. The two modes share the protocol envelope; only the signer differs.

## Commands

```bash
forge build
forge test
pnpm agent:typecheck
pnpm web:build
pnpm sdk:typecheck
```

Important policy invariants covered by the implementation and demo surface:

- denied payments do not move funds;
- `paymentId` cannot settle twice;
- rolling budget is consumed only through `SettlementRouter`;
- merchant must be allowlisted;
- receipt is required when policy requires it;
- context hash mismatch blocks settlement;
- direct state-changing authorization is disabled outside the router.

Stylus commands:

```bash
cd contracts/osmium-stylus
cargo check
cargo test --features stylus-test
cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com
cargo stylus deploy --endpoint https://rpc.testnet.chain.robinhood.com --private-key $PRIVATE_KEY
```

The current Stylus check passes on Robinhood Chain Testnet with a 22.7 KB contract and an estimated activation data fee of about 0.000131 ETH.

## Prompt Injection Guardrail

Osmium does not try to classify prompts. It constrains what a compromised agent can do economically.

The `intentHash` path lets a user pre-approve a bounded payment intent:

- policy id
- context hash
- max amount
- expiry

The agent must call `authorizePaymentWithIntent` with the approved `contextHash`. If prompt injection changes the merchant, amount, token, receipt, expiry, replay context, or runtime context hash, the onchain policy blocks the action.

## Settlement

The payment path now has two layers:

1. The Stylus `PolicyEngine` records deterministic allow/block decisions.
2. The Solidity `OsmiumSettlementRouter` holds ERC20 funds and calls `authorizePaymentForAgent`.

```text
AI agent
  -> OsmiumSettlementRouter
  -> Stylus PolicyEngine
  -> allow / deny
  -> ERC20 settlement + receipt + replay state
```

If the engine returns `true`, the router transfers the token to the merchant and emits `PaymentSettled`. If the engine returns `false`, no funds move and the router emits `PaymentDenied`. This demonstrates the intended Arbitrum Stylus interop model: policy logic in Rust/Stylus, settlement in Solidity.

The direct state-changing `authorizePaymentWithIntent` path is disabled and returns `USE_SETTLEMENT_ROUTER`. `previewAuthorizationWithIntent` remains available for read-only previews, but budget, replay, and receipt state are consumed only through router settlement.

Router deposits credit the vault by the token balance delta actually received, so fee-on-transfer test tokens cannot over-credit the internal vault accounting.

For USDG-specific demos, fund the wallet with test USDG through the Paxos faucet, approve the router, deposit into the router vault, and call `settleWithIntent`. The live TSLA flow below already proves real token custody and settlement on Robinhood Chain.

Live TSLA settlement proof:

- TSLA policy setup tx: `0x17d5c72af5b23d9d6b3f143627cbcab271a5ab93ae90b84210816e92f8dab214`
- TSLA intent approval tx: `0x86d8d024b690562bb0570563c199c2040a566866be846522a27f74acba5a66ed`
- Latest TSLA router approve tx: `0xc1f3dd6e2329c0f0fb26bc6e7fe44c38f0ac704407c33badfd8dfada0f5b5436`
- Latest TSLA router deposit tx: `0x49620dae5c966bd2239e1e4b04822b24e7e3e8ed96de358b9b6752bc0ac3198b`
- Latest TSLA settled payment tx: `0x637497c49897bb01ff1010cb83ad50eab4ff43b15a9f305e497445f120c6d6c2`
- Latest payment id: `0xb42aeba10ad5bec6c35c208f2908da26010bdc3ede9c5fb3a37a91b57111f4f0`
- Latest receipt hash: `0xf79b4a7a5343f9d9f1faa0eb9d0069125c63bdc1aecd03c903d0209d8305bca3`
- Settled amount: `0.25 TSLA`
- Replay check after settlement: `Replay`
- Router vault remaining balance after latest run: `0.75 TSLA`
- Merchant TSLA balance after latest run: `2.50 TSLA`
- Merchant data unlock after settlement: `true`

Run the full live proof with:

```bash
pnpm agent:live-settlement
```

It prints owner, router, and merchant balances before and after settlement, the approval/deposit/settlement transaction hashes, the stored PolicyEngine receipt, and a replay preview showing `reasonName: "Replay"`.

## Judge Demo Path

1. Open the dashboard and run `Health`.
2. Run `Preview` to show allowed and blocked policy decisions.
3. Trigger the protected settlement path locally with `pnpm agent:live-settlement` or `/demo/live-settlement/run`.
4. Show merchant TSLA balance increasing and router vault balance changing.
5. Show the stored receipt hash in the PolicyEngine.
6. Show replay preview returning `Replay`.

## Known Limitations

- Osmium is a hackathon prototype, not audited production infrastructure.
- The x402 integration is a custom Osmium facilitator for Robinhood Chain delegated vault settlement. It is x402-compatible at the HTTP resource/facilitator layer, but it does not claim CDP facilitator support on Robinhood Chain.
- Merchant categories are stored as metadata, but current policy enforcement is merchant allowlist based rather than category based.
- Intent hashes are globally unique in the current engine; use a distinct intent hash per live policy, or point the runner at the active TSLA policy as this demo does.
- Merchant receipts now include EIP-712 typed data and can be signed by a configured service key; they still do not independently verify offchain service quality.
- Merchant real-world identity/KYB, Coinbase CDP facilitator integration, private policy rules, and cross-chain settlement are out of scope for this MVP.
- The public dashboard should not expose runner secrets. Keep `/demo/run` local, server-side, or protected by a private operator flow.
- Precondition failures such as wrong policy token or insufficient router vault balance revert; policy denials emit auditable engine/router events.

## Demo Story

1. User deposits test USDG into Osmium.
2. User creates a policy for an AI agent: verified merchants only, max spend, rolling budget, receipt required.
3. Agent pays a verified data/API merchant: accepted.
4. Agent tries an unknown merchant: `PaymentBlocked(UnknownMerchant)`.
5. Agent tries to overspend: `PaymentBlocked(OverBudget)` or `PaymentBlocked(OverMaxTx)`.
6. Agent replays a payment id: `PaymentBlocked(Replay)`.
