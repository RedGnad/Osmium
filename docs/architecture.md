# Osmium — Architecture & Onchain Reference

Detailed technical material moved out of the top-level README to keep the
submission entry point focused. Nothing here is deprecated — it is the deep
reference for the contracts, the runner surface, and the proof matrix.

## Component surface

1. **Stylus `PolicyEngine`** (`contracts/osmium-stylus/src/lib.rs`) — deterministic
   onchain checks before funds move: verified merchant, token, max-per-tx,
   rolling budget, receipt hash, intent/context binding, replay protection.
2. **Solidity `OsmiumSettlementRouter`** (`contracts/solidity/src/OsmiumSettlementRouter.sol`)
   — ERC20 custody. `deposit` / `withdraw` per owner; `settleWithIntent` calls
   the engine, transfers on allow, emits `PaymentSettled` / `PaymentDenied`.
3. **`MockERC20`** (`contracts/solidity/src/MockERC20.sol`) — local-test token.
   Note: the live demo uses Robinhood Chain's role-gated TSLA token, not this.
4. **Agent runner** (`apps/agent-runner`) — Express service: merchant resource,
   x402 verify/settle, audit store, self-serve observe endpoint.
5. **Web console** (`apps/web`) — Vite/React Clearing House UI.

## Live deployments — Robinhood Chain Testnet

- Stylus `PolicyEngine`: `0x5e30622c7639aa5edc43313830c9a01341585728`
- Solidity `SettlementRouter`: `0x1CD04cbD3348D5fa28B30776902464752e878ac7`
- TSLA token: `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`
- USDG token: `0x7E955252E15c84f5768B83c41a71F9eba181802F`
- Active TSLA demo policy id: `2`
- USDG policy id: `1`

Provisioning transaction history:

- PolicyEngine deployment tx: `0x344c48bff7e6852220491d50003d38218ec439a3dc4c4a6f69b5f6d36223ec80`
- PolicyEngine activation tx: `0x810bd4ddb6a6b911c9708a922580d1e3c7887d9b004ca40fbc4f3f4bb86ace3a`
- SettlementRouter deployment tx: `0x43a1e173603e7664ec60ecaa9f95518a1be202dab42dfa2a45779759a93cf323`
- Set settlement router tx: `0x2b1390cb22a8320fdf39536466659b0a5279184db2385f8078afe68a6a46e770`
- Init tx: `0x59c997c90e04be6e60720a985f081b9e419872825c4b0fc397e3acecf9541efb`
- TSLA policy setup tx: `0x17d5c72af5b23d9d6b3f143627cbcab271a5ab93ae90b84210816e92f8dab214`
- TSLA intent approval tx: `0x86d8d024b690562bb0570563c199c2040a566866be846522a27f74acba5a66ed`

## Runner endpoints

```text
GET  /health
GET  /merchant/quote?asset=TSLA|AMD|AMZN
GET  /merchant/market-data?asset=TSLA          -> 402 + PAYMENT-REQUIRED
POST /merchant/receipt
GET  /merchant/audit
GET  /x402/supported
POST /x402/verify                              -> read-only PolicyEngine preview
POST /x402/settle           (operator-key)     -> demo-lane settlement
POST /x402/settle/observe                      -> self-serve audit ingestion
GET  /demo/operator-token                      -> public team demo key
```

## Settlement model

Two layers:

1. The Stylus `PolicyEngine` records deterministic allow/block decisions.
2. The Solidity `OsmiumSettlementRouter` holds ERC20 funds and calls
   `authorizePaymentForAgent`.

```text
AI agent -> OsmiumSettlementRouter -> Stylus PolicyEngine
         -> allow / deny -> ERC20 settlement + receipt + replay state
```

If the engine returns `true`, the router transfers the token to the merchant
and emits `PaymentSettled`. If it returns `false`, no funds move and the router
emits `PaymentDenied`. Policy logic in Rust/Stylus, settlement in Solidity.

The direct state-changing `authorizePaymentWithIntent` path is disabled and
returns `USE_SETTLEMENT_ROUTER`. `previewAuthorizationWithIntent` remains for
read-only previews; budget, replay, and receipt state are consumed only through
router settlement. Router deposits credit the vault by the actual received
balance delta, so fee-on-transfer tokens cannot over-credit vault accounting.

## Onchain proof matrix

| Scenario | Expected result | Proof surface |
| --- | --- | --- |
| Verified merchant + valid receipt | Settled | `PaymentSettled`, merchant balance delta, filed receipt |
| Replay payment id | Denied | Policy preview returns `Replay` |
| Unknown merchant | Denied | Policy preview returns `UnknownMerchant` |
| Missing receipt | Denied | Policy preview returns `MissingReceipt` |
| Over max payment | Denied | Policy preview returns `OverMaxTx` |
| Context mismatch | Denied | Stylus intent/context binding returns `ContextMismatch` |
| Wrong token | Denied | Router policy token check / policy preview |

## Merchant-signed receipts

Osmium returns an EIP-712 `MerchantReceipt` attestation when a protected
resource unlocks. The receipt binds merchant + agent, policy id + chain id,
token asset + amount, resource id + response hash, payment id + settlement tx
hash, and expiry.

With `MERCHANT_RECEIPT_SIGNER_PRIVATE_KEY` configured, the merchant signs the
typed data and the response includes `signature`, `expectedSigner`,
`recoveredSigner`, `verified: true`. Without it, the runner returns the typed
data in `unsigned-demo` mode so the structure is inspectable without exposing a
secret. It does not verify offchain data quality — it proves which resource was
unlocked for which settlement.

## Prompt-injection guardrail

Osmium does not classify prompts. It constrains what a compromised agent can do
economically. The `intentHash` path lets a user pre-approve a bounded payment
intent (policy id, context hash, max amount, expiry). The agent must settle
with the approved `contextHash`; if injection changes merchant, amount, token,
receipt, expiry, or runtime context, the onchain policy blocks the action.

## Policy invariants

- denied payments do not move funds;
- `paymentId` cannot settle twice;
- rolling budget is consumed only through `SettlementRouter`;
- merchant must be allowlisted;
- receipt is required when policy requires it;
- context hash mismatch blocks settlement;
- direct state-changing authorization is disabled outside the router.

## Stylus commands

```bash
cd contracts/osmium-stylus
cargo check
cargo test --features stylus-test
cargo stylus check  --endpoint https://rpc.testnet.chain.robinhood.com
cargo stylus deploy --endpoint https://rpc.testnet.chain.robinhood.com --private-key $PRIVATE_KEY
```

The Stylus check passes on Robinhood Chain Testnet with a 22.7 KB contract and
an estimated activation data fee of ~0.000131 ETH.

## Hackathon context

- Event: Arbitrum Open House London Online Buildathon
- Primary track: Best Agentic Project
- Primary chain: Robinhood Chain Testnet · Secondary: Arbitrum Sepolia
- Core technology: Arbitrum Stylus / Rust, Solidity settlement interop
