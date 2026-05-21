import { loadConfig } from "../apps/agent-runner/src/config.js";

type VercelResponseLike = {
  status(status: number): VercelResponseLike;
  json(body: unknown): void;
};

export default function handler(_request: unknown, response: VercelResponseLike) {
  try {
    const config = loadConfig();
    if (config.requireRunnerApiKey && !config.runnerApiKey) {
      response.status(503).json({
        ok: false,
        error: "RUNNER_API_KEY is required when RUNNER_REQUIRE_API_KEY=true"
      });
      return;
    }

    response.status(200).json({
      ok: true,
      chainId: config.chainId,
      engineAddress: config.engineAddress,
      settlementRouterAddress: config.settlementRouterAddress,
      auditStore: process.env.TURSO_DATABASE_URL ? "turso" : process.env.AUDIT_STORE_PATH ? "json" : "memory"
    });
  } catch (error) {
    response.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : "unknown runner configuration error"
    });
  }
}
