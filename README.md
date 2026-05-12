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

- Stylus `PolicyEngine`: `0x2db67dafbeaa8ca9787a7de4198b1a5413fe08ca`
- Solidity `SettlementRouter`: `0x50f2fdB5A5E0a2490655e5208bE17e0e6bDC6E2b`
- Deployment tx: `0x4bbe05f16daa75bc15a3a6aa72f32a674849f610f3c6e6408c0e45261c324c2b`
- Activation tx: `0x0f7b193f2bdfdff80b5c1999af7746db5c40989f6c13fac1717df711298992d7`
- SettlementRouter deployment tx: `0x1fc26656a412688ce1235807fe3b3d176163c3b5f7a126b4a4977ea0a2cebcef`
- Set settlement router tx: `0x9b72ad0e012c960921fb6fa7b9ed61a27a737198abf4df2ba173ebcf200aa89f`
- Init tx: `0xea827c837410c91525cbf67a4c8ae19814ce0bc18b3bc491a43c1330ae591992`
- Register merchant tx: `0x8383c074e9ccb7db9bf317121fda2bdcd8d2d4b13e510db680bfbaef5be04e35`
- Create policy tx: `0x6cb4ee7daa72aba1f5d41769811a801d1e3ec7a5175998c5d8593a9a2116bf27`
- Approve intent tx: `0x1ab71aff514a6327e14059d50bf22121e4c189ed5dba91c5d9ee8dd072a4907d`
- Current demo policy id: `1`
- Demo merchant: `0x000000000000000000000000000000000000beef`
- Demo token/USDG: `0x7E955252E15c84f5768B83c41a71F9eba181802F`

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

The current Stylus check passes on Robinhood Chain Testnet with a 23.3 KB contract and an estimated activation data fee of about 0.000133 ETH.

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

The current demo wallet has no USDG balance yet, so the next live settlement step is to fund the wallet with test USDG, approve the router, deposit into the router vault, and call `settleWithIntent`.

## Demo Story

1. User deposits test USDG into Osmium.
2. User creates a policy for an AI agent: verified merchants only, max spend, rolling budget, receipt required.
3. Agent pays a verified data/API merchant: accepted.
4. Agent tries an unknown merchant: `PaymentBlocked(UnknownMerchant)`.
5. Agent tries to overspend: `PaymentBlocked(OverBudget)` or `PaymentBlocked(OverMaxTx)`.
6. Agent replays a payment id: `PaymentBlocked(Replay)`.
