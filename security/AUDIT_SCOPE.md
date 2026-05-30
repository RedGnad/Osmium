# Audit Scope

This is the recommended scope for a future production audit. It is not an audit
claim.

## In Scope

- Stylus `PolicyEngine` policy creation and update paths.
- Merchant allowlist and status checks.
- Intent hash and context hash binding.
- Receipt requirement and replay protection.
- Rolling budget accounting.
- `SettlementRouter` deposit, withdraw and `settleWithIntent`.
- Token transfer safety and fee-on-transfer accounting.
- Runner x402 verify/settle request validation.
- Merchant receipt EIP-712 binding and signature verification.

## Out of Scope For Current Buildathon Demo

- Mainnet custody operations.
- Legal/KYB validation of merchants.
- Offchain market-data truth.
- Full AP2 compliance.
- Coinbase CDP facilitator compatibility.
- Private policy execution.
- Cross-chain settlement.

## Existing Validation

- Foundry tests cover allowed settlement, blocked settlement, replay, missing
  receipt, unknown merchant, wrong context, over max and vault accounting.
- `pnpm agent:proofs` captures a public proof matrix with one on-chain TSLA
  settlement row and pre-settlement denial rows.
- `pnpm merchant:test` and `pnpm external-agent:test` prove external integration
  surfaces cannot unlock data without Osmium receipt verification.
