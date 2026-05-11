# Osmium Threat Model

Osmium focuses on runtime economic controls for autonomous agents that can initiate payments.

## Protected User

A user funds an agent-facing vault but wants enforceable limits before funds move.

## Threats Covered In MVP

- Unknown or malicious merchant address.
- Agent spending with an unapproved token.
- Oversized individual payment.
- Rolling budget exhaustion.
- Expired policy.
- Missing receipt hash.
- Replayed payment id.
- Agent key compromise within bounded policy limits.

## Threats Not Covered Yet

- Offchain service quality verification.
- Real-world merchant identity/KYB.
- Full x402 facilitator integration.
- Private policy rules.
- Multi-sig or human approval for high-risk payments.
- Cross-chain settlement.

## Design Choice

The risk engine is deterministic and onchain. It does not claim to infer intent or run AI onchain. This keeps the demo auditable and aligned with smart contract judging criteria.

