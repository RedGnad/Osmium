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
- Prompt-injected agent attempts that do not match a pre-approved payment intent.

## Threats Not Covered Yet

- Offchain service quality verification.
- Real-world merchant identity/KYB.
- Full x402 facilitator integration.
- Private policy rules.
- Multi-sig or human approval for high-risk payments.
- Cross-chain settlement.

## Design Choice

The risk engine is deterministic and onchain. It does not claim to infer intent or run AI onchain. This keeps the demo auditable and aligned with smart contract judging criteria.

## Prompt Injection Boundary

Osmium assumes prompt injection may succeed at the model/tool layer. The protection is economic containment:

- `intentHash` binds an approved task context to a policy.
- `maxAmount` caps the payment even if the agent is manipulated.
- merchant and token checks prevent arbitrary redirection.
- expiry limits stale intent reuse.
- `paymentId` prevents exact replay.

This makes prompt injection visible as blocked onchain behavior instead of relying on offchain AI detection.
