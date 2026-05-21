type VercelResponseLike = {
  status(status: number): VercelResponseLike;
  json(body: unknown): void;
};

export default function handler(_request: unknown, response: VercelResponseLike) {
  const engineAddress =
    process.env.OSMIUM_POLICY_ENGINE_ADDRESS ?? process.env.POLICY_ENGINE_ADDRESS ?? null;
  const settlementRouterAddress =
    process.env.OSMIUM_SETTLEMENT_ROUTER_ADDRESS ?? process.env.SETTLEMENT_ROUTER_ADDRESS ?? null;
  const runnerKeyConfigured =
    process.env.RUNNER_REQUIRE_API_KEY !== "true" || Boolean(process.env.RUNNER_API_KEY);

  response.status(runnerKeyConfigured && engineAddress && settlementRouterAddress ? 200 : 503).json({
    ok: Boolean(runnerKeyConfigured && engineAddress && settlementRouterAddress),
    chainId: Number(process.env.CHAIN_ID ?? "46630"),
    engineAddress,
    settlementRouterAddress,
    auditStore: process.env.TURSO_DATABASE_URL ? "turso" : process.env.AUDIT_STORE_PATH ? "json" : "memory",
    runnerKeyConfigured
  });
}
