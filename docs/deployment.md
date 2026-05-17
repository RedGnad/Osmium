# Deployment

Osmium uses two deployments:

1. Public frontend on Vercel.
2. Protected agent runner on Render or another Node host.

## Vercel Frontend

Deploy from the repo root. `vercel.json` builds `apps/web` and outputs `apps/web/dist`.

Use only public frontend variables on Vercel:

```bash
VITE_AGENT_RUNNER_URL=https://your-runner.example
VITE_CHAIN_ID=46630
VITE_RH_RPC_URL=https://rpc.testnet.chain.robinhood.com
VITE_OSMIUM_POLICY_ENGINE_ADDRESS=0x5e30622c7639aa5edc43313830c9a01341585728
VITE_OSMIUM_SETTLEMENT_ROUTER_ADDRESS=0x1CD04cbD3348D5fa28B30776902464752e878ac7
```

Do not put private keys or `RUNNER_API_KEY` in Vercel `VITE_*` variables. Anything prefixed with `VITE_` is bundled into the browser.

## Runner

Deploy the runner as a Node service:

```bash
pnpm install --frozen-lockfile
pnpm agent:dev
```

Use private environment variables on the runner host:

```bash
RH_RPC_URL=https://your-robinhood-rpc
CHAIN_ID=46630
OSMIUM_POLICY_ENGINE_ADDRESS=0x5e30622c7639aa5edc43313830c9a01341585728
OSMIUM_SETTLEMENT_ROUTER_ADDRESS=0x1CD04cbD3348D5fa28B30776902464752e878ac7
AGENT_PRIVATE_KEY=...
AGENT_ADDRESS=0xc256f4721DB25616147CEFffc751f93E40Eb37e3
MERCHANT_RECEIPT_SIGNER_PRIVATE_KEY=... # optional EIP-712 service receipt signer
RUNNER_API_KEY=...
RUNNER_REQUIRE_API_KEY=true
RUNNER_ALLOWED_ORIGIN=https://your-vercel-app.vercel.app
PORT=10000
POLICY_ID=2
SETTLEMENT_DEMO_POLICY_ID=2
TOKEN_ADDRESS=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
SETTLEMENT_DEMO_TOKEN_ADDRESS=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
MERCHANT_ADDRESS=0x000000000000000000000000000000000000beef
UNKNOWN_MERCHANT_ADDRESS=0x0000000000000000000000000000000000000bad
MAX_PER_TX_WEI=1000000000000000000
PERIOD_LIMIT_WEI=3000000000000000000
AUDIT_STORE_PATH=.osmium/audit-store.json
```

Optional latest proof variables can seed read-only demos after a restart:

```bash
LATEST_SETTLEMENT_TX=0x5ca16275547d0e2ec347a10a2962443000119ca211fab80608ac1b94d86f4cc4
LATEST_SETTLEMENT_PAYMENT_ID=0xed5a3b5ea4ba085a67aa0cc8e778c65cbd1c7a6cfdbe091c12d152431771792c
LATEST_SETTLEMENT_RECEIPT_HASH=0x043d45e765abcf54425e1c93aeae7dd069e29b5e3cdd508ca1e272285afc5dee
```
