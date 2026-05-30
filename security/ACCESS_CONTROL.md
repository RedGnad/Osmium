# Access Control

| Role | Can do | Cannot do | Current state | Production plan |
| --- | --- | --- | --- | --- |
| Vault owner / user | fund vault, approve policy intent, withdraw own funds | bypass policy checks for settlement | demo lane uses team-funded vault; self-serve lane signs user transactions | workspace keys, clearer owner dashboards, multisig options |
| External agent | request protected resources, build payment payloads, explain actions | move funds without policy clearance | demo agent address bound to TSLA policy | per-agent mandates and key isolation |
| Merchant | return 402 challenge, verify receipt before unlock, sign service receipt | force settlement or bypass replay | verified TSLA merchant address | merchant registry and signed discovery metadata |
| Runner / operator | expose x402 endpoints, submit demo-lane settlement, write audit row | change onchain policy outcomes | Vercel serverless runner with private env keys | scoped keys, rotation, monitoring, rate limits |
| Deployer / admin | deploy/activate contracts, set settlement router, register merchants | spend vault funds directly | local/server env key, testnet admin | multisig/timelock for mainnet |
| `PolicyEngine` | enforce policy and replay/budget/context checks | custody ERC20 funds | Stylus contract on Robinhood Chain Testnet | audit and versioned upgrades |
| `SettlementRouter` | hold vault balances, settle after policy approval | approve invalid payment by itself | Solidity contract on Robinhood Chain Testnet | audit, emergency procedures |

## Notes

- Frontend `VITE_*` variables are public and must never include private keys.
- `RUNNER_API_KEY`, `AGENT_PRIVATE_KEY`, `ADMIN_PRIVATE_KEY` and receipt signer
  keys belong only in server-side/local secrets.
- Demo operator clearance is intentionally bounded to a finite team-funded TSLA
  testnet vault.
