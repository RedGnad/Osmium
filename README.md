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

## Robinhood Chain Testnet

- Chain ID: `46630`
- Public RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`
- Faucet: `https://faucet.testnet.chain.robinhood.com`

Useful testnet assets include `USDG`, `WETH`, and stock tokens like `TSLA`, `AMZN`, `PLTR`, `NFLX`, and `AMD`.

## Commands

```bash
forge build
forge test
```

Stylus commands:

```bash
cd contracts/osmium-stylus
cargo check
cargo test --features stylus-test
cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com
cargo stylus deploy --endpoint https://rpc.testnet.chain.robinhood.com --private-key $PRIVATE_KEY
```

The current Stylus check passes on Robinhood Chain Testnet with a 19.2 KB contract and an estimated activation data fee of about 0.000117 ETH.

## Demo Story

1. User deposits test USDG into Osmium.
2. User creates a policy for an AI agent: verified merchants only, max spend, rolling budget, receipt required.
3. Agent pays a verified data/API merchant: accepted.
4. Agent tries an unknown merchant: `PaymentBlocked(UnknownMerchant)`.
5. Agent tries to overspend: `PaymentBlocked(OverBudget)` or `PaymentBlocked(OverMaxTx)`.
6. Agent replays a payment id: `PaymentBlocked(Replay)`.
