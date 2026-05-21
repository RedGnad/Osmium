import { loadConfig } from "../apps/agent-runner/src/config.js";

type VercelResponseLike = {
  status(status: number): VercelResponseLike;
  json(body: unknown): void;
};

export default function handler(_request: unknown, response: VercelResponseLike) {
  try {
    const config = loadConfig();
    response.status(200).json({
      name: "Osmium Runner API",
      status: "ok",
      chainId: config.chainId,
      policyEngine: config.engineAddress,
      settlementRouter: config.settlementRouterAddress,
      endpoints: [
        "/api/health",
        "/api/merchant/market-data",
        "/api/merchant/audit",
        "/api/x402/supported",
        "/api/x402/verify",
        "/api/x402/settle",
        "/api/x402/settle/observe"
      ]
    });
  } catch (error) {
    response.status(503).json({
      name: "Osmium Runner API",
      status: "config_error",
      error: error instanceof Error ? error.message : "unknown runner configuration error"
    });
  }
}
