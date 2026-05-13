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
- `RUNNER_REQUIRE_API_KEY=true`
- `RUNNER_ALLOWED_ORIGIN=https://your-dashboard.example`

Never commit `.env`.

## Endpoints

- `GET /health`: no transaction, safe liveness check.
- `POST /demo/preview`: public view-only authorization previews.
- `POST /demo/live-settlement/preview`: public read-only balances, latest receipt, and replay proof.
- `POST /demo/live-settlement/run`: protected endpoint that settles TSLA through the router.
- `GET /merchant/quote?asset=TSLA`: public verified market-data quote.
- `GET /merchant/quote?asset=AMD`: public verified market-data quote.
- `POST /merchant/receipt`: verifies the latest receipt and unlocks the demo data payload.
- `GET /merchant/audit`: in-memory settlement/unlock audit records for the running demo service.
- `GET /merchant/market-data?asset=TSLA`: x402-compatible resource endpoint. Without proof it returns `402 Payment Required` plus a `PAYMENT-REQUIRED` header; with `paymentId` and `receiptHash` it returns unlocked data plus `PAYMENT-RESPONSE`.
- `GET /x402/supported`: lists the Osmium custom scheme, network, assets, and settlement model.
- `POST /x402/verify`: verifies an Osmium x402 payment payload against the Stylus policy engine without moving funds.
- `POST /x402/settle`: protected endpoint that settles a verified Osmium x402 payload through the router.

The preview path uses `previewAuthorizationWithIntent`. The state-changing path uses `OsmiumSettlementRouter.settleWithIntent`, which calls `authorizePaymentForAgent` on the Stylus engine.

The merchant path is intentionally small: it models one verified Market Data API instead of a full marketplace. The agent asks for a TSLA or AMD quote, receives a price, merchant address, service id, data hash, and receipt requirement, then Osmium settlement unlocks the data once the receipt is visible onchain.

The x402 path is intentionally precise: Osmium does not claim to use the Coinbase CDP facilitator on Robinhood Chain. It implements a custom x402-compatible scheme, `osmium-exact`, for delegated vault settlement on `eip155:46630`.

The runner keeps a small JSON-backed audit store keyed by `paymentId`. It records operator-triggered settlements and receipt unlocks. This is hackathon-grade observability rather than a production database; a hosted demo can set `AUDIT_STORE_PATH` to a persistent disk path, while a future production system should use an indexer or durable database.

## Live Settlement Script

Run:

```bash
pnpm agent:live-settlement
```

The script performs the TSLA settlement proof against the deployed router:

- reads owner, router vault, and merchant balances;
- approves and deposits TSLA into the `OsmiumSettlementRouter`;
- calls `settleWithIntent`;
- reads the stored PolicyEngine receipt;
- previews the same payment id again and expects `Replay`.

Direct state-changing authorization is intentionally disabled on the PolicyEngine. Use previews for dry runs and router settlement for any transaction that should consume budget, replay, and receipt state.

Protected requests need:

```http
x-osmium-api-key: your-secret
```

Do not expose this value through `VITE_` frontend variables. Vite embeds `VITE_*` values in the browser bundle, so the public dashboard only calls `/health`, `/demo/preview`, and `/demo/live-settlement/preview`. Keep `/demo/live-settlement/run` local, server-side, or behind an operator-only trigger for judged demos.

`RUNNER_ALLOWED_ORIGIN` controls CORS. Local development defaults to `http://127.0.0.1:5173`.

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
