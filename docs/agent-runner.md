# Osmium Agent Runner

The agent runner is the offchain component that turns agent intent into onchain authorization attempts.

It can run in three modes:

1. Local CLI during development.
2. Render web service for the live hackathon demo.
3. Cron-triggered HTTP endpoint via cron-job.org for periodic demo/workflow execution.

## Recommended Hackathon Setup

Use Render as a small Express service:

- Build command: `pnpm install --frozen-lockfile && pnpm agent:typecheck`
- Start command: `pnpm agent:dev`
- Health check path: `/health`
- Port: `10000`

Use an Alchemy or QuickNode Robinhood Testnet RPC in `RH_RPC_URL` for deployed demos. The public Robinhood RPC is useful for light reads, but deployment and activation can hit `429 Too Many Requests`.

Use Render secret environment variables for:

- `ADMIN_PRIVATE_KEY`
- `AGENT_PRIVATE_KEY`
- `RUNNER_API_KEY`

Never commit `.env`.

## Endpoints

- `GET /health`: no transaction, safe liveness check.
- `POST /demo/preview`: runs view-only authorization previews.
- `POST /demo/run`: sends authorization transactions from the agent wallet.

The demo path uses `authorizePaymentWithIntent`, so setup must approve `DEMO_INTENT_HASH` for the active `POLICY_ID`.

If `RUNNER_API_KEY` is set, protected requests need:

```http
x-osmium-api-key: your-secret
```

## Why An External Runner Is Fine

The runner is intentionally untrusted. If it is compromised, it still has to pass the onchain policy engine:

- merchant allowlist
- token constraint
- max transaction size
- rolling budget
- receipt hash requirement
- payment id replay protection

This is the core Osmium thesis: agents and agent infrastructure can fail, but economic actions stay bounded by onchain policy.

## Render Free Tier Notes

Render's official docs currently say Hobby workspaces support up to 25 services, and free web services spin down after 15 minutes without inbound traffic. Free web services get 750 free instance hours per workspace per calendar month and have an ephemeral filesystem. That is acceptable for a hackathon demo because Osmium state lives onchain, not on Render's disk.
