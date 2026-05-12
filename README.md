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

- Stylus `PolicyEngine`: `0x5e30622c7639aa5edc43313830c9a01341585728`
- Solidity `SettlementRouter`: `0xdC643A9b5A160108A39E0e712b6c181133c03bb2`
- PolicyEngine deployment tx: `0x344c48bff7e6852220491d50003d38218ec439a3dc4c4a6f69b5f6d36223ec80`
- PolicyEngine activation tx: `0x810bd4ddb6a6b911c9708a922580d1e3c7887d9b004ca40fbc4f3f4bb86ace3a`
- SettlementRouter deployment tx: `0x7751ca2033eaa08583925240241dc7d0ebcc9c556b9315ee4f7114ae0ce26361`
- Set settlement router tx: `0x5f8129ee0cd4263ce0ca16dc32a025fa6ba772bb0c476c3165de3a436ea1ea9b`
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

If the engine returns `true`, the router transfers the token to the merchant and emits `PaymentSettled`. If the engine returns `false`, no funds move and the router emits `PaymentDenied`. This demonstrates the intended Arbitrum Stylus interop model: policy logic in Rust/Stylus, settlement in Solidity.

The direct state-changing `authorizePaymentWithIntent` path is disabled and returns `USE_SETTLEMENT_ROUTER`. `previewAuthorizationWithIntent` remains available for read-only previews, but budget, replay, and receipt state are consumed only through router settlement.

For USDG-specific demos, fund the wallet with test USDG through the Paxos faucet, approve the router, deposit into the router vault, and call `settleWithIntent`. The live TSLA flow below already proves real token custody and settlement on Robinhood Chain.

Live TSLA settlement proof:

- TSLA policy setup tx: `0x17d5c72af5b23d9d6b3f143627cbcab271a5ab93ae90b84210816e92f8dab214`
- TSLA intent approval tx: `0x86d8d024b690562bb0570563c199c2040a566866be846522a27f74acba5a66ed`
- TSLA router approve tx: `0x1539a217004862e8f35278272caa1fea50d074217c48e979ebf203eeb82ce71d`
- TSLA router deposit tx: `0xf568135becfbc3c74cb4905801c3a9f611e0d2f85a3d8802f24972fb3a03907d`
- TSLA settled payment tx: `0x96169c50a6c5d9a83765ea8270c5efd8cbc185e17e854d2d9a8f08d0fc04c182`
- Settled amount: `0.25 TSLA`
- Replay check after settlement: `Replay`
- Router vault remaining balance after latest run: `0.5 TSLA`
- Merchant TSLA balance after latest run: `1.0 TSLA`

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
- Merchant categories are stored as metadata, but current policy enforcement is merchant allowlist based rather than category based.
- Intent hashes are globally unique in the current engine; use a distinct intent hash per live policy, or point the runner at the active TSLA policy as this demo does.
- Receipts prove that an agent supplied a receipt hash; they do not independently verify offchain service quality.
- Merchant real-world identity/KYB, x402 facilitator integration, private policy rules, and cross-chain settlement are out of scope for this MVP.
- The public dashboard should not expose runner secrets. Keep `/demo/run` local, server-side, or protected by a private operator flow.
- Precondition failures such as wrong policy token or insufficient router vault balance revert; policy denials emit auditable engine/router events.

## Demo Story

1. User deposits test USDG into Osmium.
2. User creates a policy for an AI agent: verified merchants only, max spend, rolling budget, receipt required.
3. Agent pays a verified data/API merchant: accepted.
4. Agent tries an unknown merchant: `PaymentBlocked(UnknownMerchant)`.
5. Agent tries to overspend: `PaymentBlocked(OverBudget)` or `PaymentBlocked(OverMaxTx)`.
6. Agent replays a payment id: `PaymentBlocked(Replay)`.
