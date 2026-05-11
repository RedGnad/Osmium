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

1. `AgentVault`: user deposits funds and creates a policy for an agent.
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
- `contracts/solidity/src/MockERC20.sol`

The Solidity contract is useful for fast local tests and as an ERC20 custody reference. The Stylus contract is the Robinhood/Arbitrum-native policy engine.

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

The current Stylus check passes on Robinhood Chain Testnet with a 23.8 KB contract and an estimated activation data fee of about 0.000137 ETH.

## Prompt Injection Guardrail

Osmium does not try to classify prompts. It constrains what a compromised agent can do economically.

The `intentHash` path lets a user pre-approve a bounded payment intent:

- policy id
- context hash
- max amount
- expiry

The agent must call `authorizePaymentWithIntent`. If prompt injection changes the merchant, amount, token, receipt, expiry, or replay context, the onchain policy blocks the action.

## Demo Story

1. User deposits test USDG into Osmium.
2. User creates a policy for an AI agent: verified merchants only, max spend, rolling budget, receipt required.
3. Agent pays a verified data/API merchant: accepted.
4. Agent tries an unknown merchant: `PaymentBlocked(UnknownMerchant)`.
5. Agent tries to overspend: `PaymentBlocked(OverBudget)` or `PaymentBlocked(OverMaxTx)`.
6. Agent replays a payment id: `PaymentBlocked(Replay)`.
