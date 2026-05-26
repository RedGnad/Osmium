import { loadConfig } from "../apps/agent-runner/src/config.js";
import { buildAgentProofArtifact, buildDefaultMandate, runAgentLoop, runAttackMode } from "../apps/agent-runner/src/agentLoop.js";
import { runDemo } from "../apps/agent-runner/src/demo.js";
import { readLiveSettlementProof, runLiveSettlement } from "../apps/agent-runner/src/liveSettlement.js";
import { marketDataQuote, marketDataResource, merchantAuditLog, unlockMarketData } from "../apps/agent-runner/src/merchant.js";
import { observeSettlement } from "../apps/agent-runner/src/observeSettlement.js";
import {
  buildPaymentPayload,
  buildPaymentRequired,
  decodeBase64Json,
  encodeBase64Json,
  OSMIUM_X402_VERSION,
  settleX402Payment,
  supportedX402,
  verifyX402Payment,
  type OsmiumPaymentRequired,
  type X402Body
} from "../apps/agent-runner/src/x402.js";

type VercelRequestLike = {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
};

type VercelResponseLike = {
  end(body?: unknown): void;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  status(status: number): VercelResponseLike;
};

type QueryMap = Record<string, unknown>;
type Address = `0x${string}`;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestHeader(request: VercelRequestLike, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === lower) return first(value);
  }
  return undefined;
}

function readQuery(request: VercelRequestLike): QueryMap {
  const url = new URL(request.url ?? "/api/runner", "https://osmium.local");
  const query: QueryMap = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) query[key] = first(value);
  }
  return query;
}

function readBody(request: VercelRequestLike) {
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body) as unknown;
    } catch {
      return {};
    }
  }
  return request.body ?? {};
}

function setCors(response: VercelResponseLike, origin: string | undefined, allowedOrigin: string) {
  const allowedOrigins = new Set(allowedOrigin.split(",").map((item) => item.trim()).filter(Boolean));
  if (!origin || allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin ?? [...allowedOrigins][0] ?? "*");
  }
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "content-type,x-osmium-api-key,payment-required,payment-signature,payment-response,x-payment");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED,PAYMENT-SIGNATURE,PAYMENT-RESPONSE");
}

function runnerPathFrom(query: QueryMap) {
  const raw = String(query.runnerPath ?? "");
  delete query.runnerPath;
  return `/${raw.replace(/^\/+/, "")}`;
}

function requireApiKey(request: VercelRequestLike, response: VercelResponseLike, runnerApiKey: string | undefined) {
  if (!runnerApiKey) {
    response.status(503).json({ error: "runner api key is not configured" });
    return false;
  }
  if (requestHeader(request, "x-osmium-api-key") !== runnerApiKey) {
    response.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  try {
    /* Everything that can throw — config loading, CORS, query parsing,
       routing, body parsing, endpoint logic — runs inside this try so the
       handler can never leak a raw Vercel "A server error has occurred"
       page to the frontend. Handled failures always return JSON below. */
    const config = loadConfig();
    setCors(response, requestHeader(request, "origin"), config.allowedOrigin);
    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }

    const query = readQuery(request);
    const path = runnerPathFrom(query);

    if (path === "/" || path === "" || path === "/health") {
      response.status(200).json({
        name: "Osmium Runner API",
        status: "ok",
        ok: true,
        chainId: config.chainId,
        policyEngine: config.engineAddress,
        engineAddress: config.engineAddress,
        settlementRouter: config.settlementRouterAddress,
        settlementRouterAddress: config.settlementRouterAddress,
        auditStore: process.env.TURSO_DATABASE_URL ? "turso" : process.env.AUDIT_STORE_PATH ? "json" : "memory"
      });
      return;
    }

    if (path === "/merchant/quote") {
      response.status(200).json(marketDataQuote(config, query.asset));
      return;
    }

    if (path === "/agent/mandate") {
      response.status(200).json(buildDefaultMandate(config));
      return;
    }

    if (path === "/agent/run") {
      const body = readBody(request) as { settle?: boolean };
      if (body.settle !== false && !requireApiKey(request, response, config.runnerApiKey)) return;
      response.status(200).json(await runAgentLoop(config, body));
      return;
    }

    if (path === "/agent/attacks") {
      response.status(200).json(await runAttackMode(config));
      return;
    }

    if (path === "/agent/proofs") {
      const body = readBody(request) as { settle?: boolean };
      if (body.settle === true && !requireApiKey(request, response, config.runnerApiKey)) return;
      response.status(200).json(await buildAgentProofArtifact(config, {
        settle: body.settle === true,
        runner: "deployed-runner"
      }));
      return;
    }

    if (path === "/merchant/audit") {
      response.status(200).json(await merchantAuditLog());
      return;
    }

    if (path === "/merchant/receipt") {
      response.status(200).json(await unlockMarketData(config, readBody(request) as { asset?: unknown; paymentId?: `0x${string}`; receiptHash?: `0x${string}` }));
      return;
    }

    if (path === "/merchant/market-data") {
      const paymentSignature = requestHeader(request, "payment-signature") ?? requestHeader(request, "x-payment");
      if (paymentSignature && !query.paymentId && !query.receiptHash) {
        const payload = decodeBase64Json<{ payload?: { paymentId?: string; receiptHash?: string } }>(paymentSignature);
        if (payload.payload?.paymentId) query.paymentId = payload.payload.paymentId;
        if (payload.payload?.receiptHash) query.receiptHash = payload.payload.receiptHash;
      }

      const result = await marketDataResource(config, query);
      if (result.status === 200) {
        response.setHeader(
          "PAYMENT-RESPONSE",
          encodeBase64Json({
            success: true,
            network: `eip155:${config.chainId}`,
            paymentId: "paymentId" in result.body ? result.body.paymentId : undefined,
            receiptHash: "receiptHash" in result.body ? result.body.receiptHash : undefined
          })
        );
        response.status(200).json(result.body);
        return;
      }

      const rawPolicy = typeof query.policyId === "string" ? query.policyId : undefined;
      const rawAgent = typeof query.agent === "string" ? query.agent : undefined;
      const rawLane = typeof query.lane === "string" ? query.lane : undefined;
      const lane = rawLane === "self-serve" || rawLane === "demo" ? rawLane : undefined;
      const agent =
        rawAgent && /^0x[a-fA-F0-9]{40}$/.test(rawAgent)
          ? (rawAgent as Address)
          : undefined;
      const paymentRequired = buildPaymentRequired(config, query.asset, {
        policyId: rawPolicy,
        agent,
        lane
      });
      response.setHeader("PAYMENT-REQUIRED", encodeBase64Json(paymentRequired));
      response.status(402).json(paymentRequired);
      return;
    }

    if (path === "/x402/supported") {
      response.status(200).json(supportedX402(config));
      return;
    }

    if (path === "/x402/verify") {
      response.status(200).json(await verifyX402Payment(config, readBody(request) as X402Body));
      return;
    }

    if (path === "/x402/settle") {
      if (!requireApiKey(request, response, config.runnerApiKey)) return;
      const body = readBody(request) as X402Body;
      if (!body.paymentPayload && body.paymentRequirements) {
        const paymentRequirements: OsmiumPaymentRequired =
          "accepts" in body.paymentRequirements
            ? body.paymentRequirements
            : {
                x402Version: OSMIUM_X402_VERSION,
                error: "payment_required",
                protocol: "x402-compatible-osmium",
                accepts: [body.paymentRequirements]
              };
        body.paymentPayload = buildPaymentPayload(paymentRequirements, config.agentAddress);
        body.paymentRequirements = paymentRequirements;
      }
      const result = await settleX402Payment(config, body);
      response.setHeader("PAYMENT-RESPONSE", encodeBase64Json(result));
      response.status(result.success ? 200 : 402).json(result);
      return;
    }

    if (path === "/x402/settle/observe") {
      const result = await observeSettlement(config, readBody(request) as { txHash?: string; lane?: "demo" | "self-serve" });
      response.status(result.ok ? 200 : 422).json(result);
      return;
    }

    if (path === "/demo/operator-token") {
      response.setHeader("Cache-Control", "no-store, max-age=0");
      response.status(200).json({
        token: config.runnerApiKey ?? null,
        lane: "demo",
        note: "Team demo key for the operator-key lane. Anyone can use it; it only moves a team-funded TSLA testnet vault. Self-serve operators sign with their own wallet instead."
      });
      return;
    }

    if (path === "/demo/preview") {
      response.status(200).json(await runDemo({ sendTransactions: false }));
      return;
    }

    if (path === "/demo/live-settlement/preview") {
      response.status(200).json(await readLiveSettlementProof());
      return;
    }

    if (path === "/demo/live-settlement/run") {
      if (!requireApiKey(request, response, config.runnerApiKey)) return;
      response.status(200).json(await runLiveSettlement());
      return;
    }

    response.status(404).json({ error: "runner endpoint not found", path });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runner error";
    /* A missing/malformed env var surfaces here as a config error so the
       frontend can tell "the runner is misconfigured" apart from a genuine
       runtime fault. Env var *names* are safe to surface; no secret values
       are ever included in the message. */
    const isConfigError = /missing required env var/i.test(message);

    /* loadConfig() may have thrown before setCors() ran, so set a minimal
       CORS header here too — otherwise a cross-origin frontend cannot even
       read this JSON error body. */
    const origin = requestHeader(request, "origin");
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("content-type", "application/json");

    response.status(500).json({
      ok: false,
      error: isConfigError ? "runner_config_error" : "runner_error",
      message
    });
  }
}
