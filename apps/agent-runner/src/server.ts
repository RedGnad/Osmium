import express from "express";
import { loadConfig } from "./config.js";
import { runDemo } from "./demo.js";
import { readLiveSettlementProof, runLiveSettlement } from "./liveSettlement.js";
import { marketDataQuote, marketDataResource, merchantAuditLog, unlockMarketData } from "./merchant.js";
import {
  buildPaymentRequired,
  buildPaymentPayload,
  decodeBase64Json,
  encodeBase64Json,
  settleX402Payment,
  supportedX402,
  verifyX402Payment
} from "./x402.js";

const config = loadConfig();
if (config.requireRunnerApiKey && !config.runnerApiKey) {
  throw new Error("RUNNER_API_KEY is required when RUNNER_REQUIRE_API_KEY=true or RENDER=true");
}

const app = express();

app.use((req, res, next) => {
  const origin = req.header("origin");
  const allowedOrigins = new Set(config.allowedOrigin.split(",").map((item) => item.trim()).filter(Boolean));
  if (!origin || allowedOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin ?? [...allowedOrigins][0]);
  }
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Headers", "content-type,x-osmium-api-key,payment-required,payment-signature,payment-response,x-payment");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Expose-Headers", "PAYMENT-REQUIRED,PAYMENT-SIGNATURE,PAYMENT-RESPONSE");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!config.runnerApiKey) {
    return res.status(503).json({ error: "runner api key is not configured" });
  }
  if (req.header("x-osmium-api-key") !== config.runnerApiKey) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.get("/", (_req, res) => {
  res.json({
    name: "Osmium Runner API",
    status: "ok",
    chainId: config.chainId,
    policyEngine: config.engineAddress,
    settlementRouter: config.settlementRouterAddress,
    endpoints: [
      "/health",
      "/merchant/market-data",
      "/merchant/audit",
      "/x402/supported",
      "/x402/verify",
      "/x402/settle"
    ]
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    chainId: config.chainId,
    engineAddress: config.engineAddress,
    settlementRouterAddress: config.settlementRouterAddress
  });
});

app.post("/demo/preview", async (_req, res, next) => {
  try {
    res.json(await runDemo({ sendTransactions: false }));
  } catch (error) {
    next(error);
  }
});

app.post("/demo/live-settlement/preview", async (_req, res, next) => {
  try {
    res.json(await readLiveSettlementProof());
  } catch (error) {
    next(error);
  }
});

app.post("/demo/live-settlement/run", requireApiKey, async (_req, res, next) => {
  try {
    res.json(await runLiveSettlement());
  } catch (error) {
    next(error);
  }
});

app.get("/merchant/quote", (req, res, next) => {
  try {
    res.json(marketDataQuote(config, req.query.asset));
  } catch (error) {
    next(error);
  }
});

app.post("/merchant/receipt", async (req, res, next) => {
  try {
    res.json(await unlockMarketData(config, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

app.get("/merchant/audit", (_req, res) => {
  res.json(merchantAuditLog());
});

app.get("/merchant/market-data", async (req, res, next) => {
  try {
    const paymentSignature = req.header("payment-signature") ?? req.header("x-payment");
    const query = { ...req.query };
    if (paymentSignature && !query.paymentId && !query.receiptHash) {
      const payload = decodeBase64Json<{ payload?: { paymentId?: string; receiptHash?: string } }>(paymentSignature);
      if (payload.payload?.paymentId) query.paymentId = payload.payload.paymentId;
      if (payload.payload?.receiptHash) query.receiptHash = payload.payload.receiptHash;
    }

    const result = await marketDataResource(config, query);
    if (result.status === 200) {
      res.header(
        "PAYMENT-RESPONSE",
        encodeBase64Json({
          success: true,
          network: `eip155:${config.chainId}`,
          paymentId: "paymentId" in result.body ? result.body.paymentId : undefined,
          receiptHash: "receiptHash" in result.body ? result.body.receiptHash : undefined
        })
      );
      return res.status(result.status).json(result.body);
    }

    const paymentRequired = buildPaymentRequired(config, req.query.asset);
    res.header("PAYMENT-REQUIRED", encodeBase64Json(paymentRequired));
    res.status(402).json(paymentRequired);
  } catch (error) {
    next(error);
  }
});

app.get("/x402/supported", (_req, res) => {
  res.json(supportedX402(config));
});

app.post("/x402/verify", async (req, res, next) => {
  try {
    res.json(await verifyX402Payment(config, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

app.post("/x402/settle", requireApiKey, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.paymentPayload && body.paymentRequirements) {
      body.paymentPayload = buildPaymentPayload(body.paymentRequirements, config.agentAddress);
    }
    const result = await settleX402Payment(config, body);
    res.header("PAYMENT-RESPONSE", encodeBase64Json(result));
    res.status(result.success ? 200 : 402).json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown error";
  res.status(500).json({ error: message });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Osmium agent runner listening on 0.0.0.0:${config.port}`);
});
