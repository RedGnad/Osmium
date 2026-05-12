# Osmium

Stylus-native policy firewall for autonomous agent payments on Arbitrum and Robinhood Chain.

Osmium lets a user fund an autonomous agent without giving it unlimited spending power. The agent can only spend through policies enforced onchain: verified merchants, token constraints, max transaction size, rolling budgets, receipt hashes, replay protection, and auditable blocked-risk events.

## Hackathon Target

- Event: Arbitrum Open House London Online Buildathon
- Primary track: Best Agentic Project
- Primary chain: Robinhood Chain Testnet
- Secondary chain: Arbitrum Sepolia
- Core technology: Arbitrum Stylus / Rust, with Solidity fallback and mocks for fast testing

## MVP Surface

1. `SettlementRouter`: user deposits funds and settlement only happens after policy approval.
2. `PolicyEngine`: deterministic onchain checks before funds move.
3. `MerchantRegistry`: allowlisted merchants with category and metadata hashes.
4. `ReceiptGate`: payment requires a receipt hash and unique payment id.
5. `RiskEvents`: blocked attempts emit explicit events instead of silently failing.

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

- Stylus `PolicyEngine`: `0x415e775269a1d0d63f272256371aa64705eea2e2`
- Solidity `SettlementRouter`: `0x8F0BC7570135b42DF062359Bf3e7b5A9d490a262`
- PolicyEngine deployment tx: `0x0faa69962af176f9465e2e6680d1402d776d02aff9f35b98a7594b01582f5e71`
- PolicyEngine activation tx: `0xcb1608fe82345de7d029ee2a569f4ccf97728c019065f30643e4b4c76ef33ecc`
- SettlementRouter deployment tx: `0xc36d7dfe1046d63dae89676cecce6775d0a8cc0b7bd4b7f6fe6b5b782062c0ae`
- Set settlement router tx: `0x54d69af3393bbc655d540b8ad65dc0f271bfbff190bf8440e3c75d559f7970e7`
- Init tx: `0x40ae7e6adb7a81a6e348c125aff1bdd94ae58b9a4be14e1dc0fe3570c0cee3f3`
- Register USDG merchant tx: `0x3e908f0090b5070f3ae6d2f54da49d2c2e75452a55bb423fb7d2cb3607333e50`
- Create USDG policy tx: `0x8c5eaef3ae7a4fcc4bf8f4d6e12d8bdc44f45b2a1a957818a84a3e1062761fc2`
- Approve USDG intent tx: `0x672d9518846e8cea8db002231f927c9259ee4b0a7dd20bf944e31e8c03672553`
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

## Robinhood Chain Testnet

- Chain ID: `46630`
- Public RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`
- Faucet: `https://faucet.testnet.chain.robinhood.com`

The public RPC is rate-limited. For deployment and activation, set `RH_RPC_URL` in `.env` to an Alchemy or QuickNode Robinhood Testnet endpoint.

Useful testnet assets include `USDG`, `WETH`, and stock tokens like `TSLA`, `AMZN`, `PLTR`, `NFLX`, and `AMD`.

## Commands

```bash
forge build
forge test
pnpm agent:typecheck
pnpm web:build
```

Stylus commands:

```bash
cd contracts/osmium-stylus
cargo check
cargo test --features stylus-test
cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com
cargo stylus deploy --endpoint https://rpc.testnet.chain.robinhood.com --private-key $PRIVATE_KEY
```

The current Stylus check passes on Robinhood Chain Testnet with a 23.2 KB contract and an estimated activation data fee of about 0.000132 ETH.

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

If the engine returns `true`, the router transfers the token to the merchant and emits `PaymentSettled`. If the engine returns `false`, no funds move and the router emits `PaymentDenied`. This demonstrates the intended Arbitrum Stylus interop model: policy logic in Rust/Stylus, settlement in Solidity.

For USDG-specific demos, fund the wallet with test USDG through the Paxos faucet, approve the router, deposit into the router vault, and call `settleWithIntent`. The live TSLA flow below already proves real token custody and settlement on Robinhood Chain.

Live TSLA settlement proof:

- TSLA policy setup tx: `0xedb485d4a0283836e7cb6d5677d80195fd4309abaac97febf7fb4992136013d6`
- TSLA intent approval tx: `0xac7d05a3140e617596319ec4a68fdad1d12124ca581e6566d65c56b04cba8775`
- TSLA router approve tx: `0x070889d7b8ae29949d853961f73ae47d89b1032adbe47368f3031c5280310a72`
- TSLA router deposit tx: `0xf53fb7ec623c5f31c72baf2b8b97937006b0ed84901af394fd8599fa8017aa80`
- TSLA settled payment tx: `0xe015a5af95bc9b11491ba083c42a2ec4f34e977e5491eae1e260bdad1cd20513`
- Settled amount: `0.25 TSLA`
- Replay check after settlement: `Replay`
- Router vault remaining balance after latest run: `0.5 TSLA`
- Merchant TSLA balance after latest run: `1.0 TSLA`

Run the full live proof with:

```bash
pnpm agent:live-settlement
```

It prints owner, router, and merchant balances before and after settlement, the approval/deposit/settlement transaction hashes, the stored PolicyEngine receipt, and a replay preview showing `reasonName: "Replay"`.

## Known Limitations

- Osmium is a hackathon prototype, not audited production infrastructure.
- Merchant categories are stored as metadata, but current policy enforcement is merchant allowlist based rather than category based.
- Intent hashes are globally unique in the current engine; use a distinct intent hash per live policy, or point the runner at the active TSLA policy as this demo does.
- Receipts prove that an agent supplied a receipt hash; they do not independently verify offchain service quality.
- Merchant real-world identity/KYB, x402 facilitator integration, private policy rules, and cross-chain settlement are out of scope for this MVP.
- The public dashboard should not expose runner secrets. Keep `/demo/run` local, server-side, or protected by a private operator flow.

## Demo Story

1. User deposits test USDG into Osmium.
2. User creates a policy for an AI agent: verified merchants only, max spend, rolling budget, receipt required.
3. Agent pays a verified data/API merchant: accepted.
4. Agent tries an unknown merchant: `PaymentBlocked(UnknownMerchant)`.
5. Agent tries to overspend: `PaymentBlocked(OverBudget)` or `PaymentBlocked(OverMaxTx)`.
6. Agent replays a payment id: `PaymentBlocked(Replay)`.
