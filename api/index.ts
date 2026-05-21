type VercelResponseLike = {
  status(status: number): VercelResponseLike;
  json(body: unknown): void;
};

export default function handler(_request: unknown, response: VercelResponseLike) {
  response.status(200).json({
    name: "Osmium Runner API",
    status: "ok",
    chainId: Number(process.env.CHAIN_ID ?? "46630"),
    policyEngine: process.env.OSMIUM_POLICY_ENGINE_ADDRESS ?? process.env.POLICY_ENGINE_ADDRESS ?? null,
    settlementRouter:
      process.env.OSMIUM_SETTLEMENT_ROUTER_ADDRESS ?? process.env.SETTLEMENT_ROUTER_ADDRESS ?? null,
    endpoints: [
      "/api/health",
      "/api/runner?runnerPath=merchant/market-data",
      "/api/runner?runnerPath=merchant/audit",
      "/api/runner?runnerPath=x402/supported",
      "/api/runner?runnerPath=x402/verify",
      "/api/runner?runnerPath=x402/settle",
      "/api/runner?runnerPath=x402/settle/observe"
    ]
  });
}
