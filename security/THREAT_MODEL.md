# Threat Model

Protected user: a team or operator that funds an AI finance agent vault and
wants policy clearance before the agent can pay for APIs, market data, MCP
tools or tokenized-asset services.

## Covered Threats

| Threat | Control | Proof surface |
| --- | --- | --- |
| Rogue agent requests arbitrary spend | policy-bound agent, merchant, token, amount | `previewAuthorizationWithIntent`, settlement tx |
| Replayed payment | `usedPaymentIds` in `PolicyEngine` | `Replay` denial |
| Unknown merchant | merchant allowlist | `UnknownMerchant` denial |
| Wrong context | intent/context hash binding | `ContextMismatch` denial |
| Missing receipt | receipt requirement | `MissingReceipt` denial |
| Over-limit spend | max-per-tx and period budget | `OverMaxTx` / `OverBudget` denial |
| Malicious merchant changes token/amount | payment requirements checked against quote and policy | x402 verify result |
| Frontend spoofing | frontend is not trusted; runner and contracts validate | runner response / contract state |
| Runner/operator failure | no clearance/settlement if runner cannot produce valid call | no funds move by default |
| Compromised demo operator key | bounded to team-funded testnet vault and policy limits | vault and policy caps |

## Not Covered Yet

| Gap | Current state | Production plan |
| --- | --- | --- |
| Mainnet custody assurance | testnet only | audit, multisig operations, staged launch |
| Real merchant KYB | demo merchant address | merchant registry, signed metadata, onboarding checks |
| Offchain data quality | signed receipt binds response hash, not truth | independent attestations and dispute path |
| CDP x402 facilitator support | custom Osmium-compatible facilitator | adapter if Robinhood Chain is supported |
| Private policies | public policy parameters | encrypted/private policy roadmap |
| Operator key compromise beyond demo | team demo key only | rotation, scopes, per-workspace keys, alerts |

## Key Principle

The LLM is never the security boundary. Osmium assumes an agent can be wrong or
prompt-injected; economic control lives in the PolicyEngine and SettlementRouter.
