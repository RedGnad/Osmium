# Trust Boundaries

Osmium is a production-oriented testnet deployment, not audited mainnet
custody. This document separates the security-critical layers from demo,
operator and integration surfaces.

## Boundary Map

| Layer | Components | Trust level | What it decides |
| --- | --- | --- | --- |
| Onchain policy | Stylus `PolicyEngine` | Security boundary | merchant allowlist, token, amount, period budget, receipt required, context binding, replay |
| Onchain custody | Solidity `SettlementRouter` | Security boundary | vault balance accounting, token transfer, settlement only after policy approval |
| Token contract | Robinhood Chain TSLA testnet token | External chain dependency | token balances and ERC20 transfer behavior |
| Runner | Vercel `/api/runner` | Operator service | x402-compatible envelope, demo-lane transaction submission, audit ingestion |
| Merchant API | TSLA market-data example | Offchain service | protected resource response and merchant-signed receipt payload |
| Frontend | Vercel app | User interface only | displays state, starts requests, never decides clearance |
| Agent / LLM | Demo runner and examples | Not trusted | can request and explain, cannot bypass policy checks |
| Proof artifact | `proofs/latest-agent-clearance.json` | Evidence artifact | points to latest captured tx/preview matrix; onchain tx is source of truth |

## Onchain

The `PolicyEngine` and `SettlementRouter` are the security boundary. A payment
can move value only when:

- the policy is active;
- the agent matches the policy;
- the merchant is registered and active;
- the token matches the policy;
- amount is under max-per-tx and period budget;
- receipt hash is present when required;
- intent hash and context hash match;
- `paymentId` has not been used before;
- the router has enough vault balance.

## Offchain

The runner, merchant API, frontend and proof artifact can fail or lie. They do
not replace onchain checks. Production hardening should add service monitoring,
key rotation, durable indexing, merchant discovery metadata and independent
receipt verification.

## Agent Boundary

The agent is allowed to choose a paid resource and explain why it requested it.
It is not allowed to decide whether funds move. Prompt injection can affect the
agent's request, but the onchain policy decides whether that request clears.
