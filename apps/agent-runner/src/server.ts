import express from "express";
import { loadConfig } from "./config.js";
import { runDemo } from "./demo.js";

const config = loadConfig();
if (config.requireRunnerApiKey && !config.runnerApiKey) {
  throw new Error("RUNNER_API_KEY is required when RUNNER_REQUIRE_API_KEY=true or RENDER=true");
}

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
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

app.post("/demo/run", requireApiKey, async (_req, res, next) => {
  try {
    res.json(await runDemo({ sendTransactions: true }));
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
