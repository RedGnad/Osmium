import express from "express";
import { loadConfig } from "./config.js";
import { runDemo } from "./demo.js";
import { readLiveSettlementProof, runLiveSettlement } from "./liveSettlement.js";
import { marketDataQuote, unlockMarketData } from "./merchant.js";

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
  res.header("Access-Control-Allow-Headers", "content-type,x-osmium-api-key");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    chainId: config.chainId,
    engineAddress: config.engineAddress
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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown error";
  res.status(500).json({ error: message });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Osmium agent runner listening on 0.0.0.0:${config.port}`);
});
