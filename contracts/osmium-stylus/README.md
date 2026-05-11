# Osmium Stylus Policy Engine

This crate contains the sponsor-native core of Osmium: a Rust/Stylus policy engine for autonomous agent payments.

The contract intentionally focuses on deterministic authorization:

- verified merchant registry
- per-agent policy ownership
- token allowlist per policy
- max transaction size
- rolling budget window
- expiry checks
- receipt hash requirement
- payment id replay protection
- `AuthorizationApproved` and `AuthorizationBlocked` events

ERC20 custody and transfer adapters can be kept in Solidity or added via Stylus `sol_interface!` once deployment checks are passing. This keeps the first Stylus artifact small and reviewable.

## Commands

```bash
cargo test
cargo stylus export-abi
cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com
```

