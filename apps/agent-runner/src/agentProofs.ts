import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentProofArtifact, type AgentProofArtifact } from "./agentLoop.js";
import { loadConfig } from "./config.js";

type RunnerBody = Record<string, unknown>;

const DEFAULT_RUNNER_URL = "https://osmium-agent-runner.vercel.app/api/runner";
const DEFAULT_OUTPUT_PATH = fileURLToPath(
  new URL("../../../proofs/latest-agent-clearance.json", import.meta.url)
);
const OUTPUT_PATH = process.env.AGENT_PROOFS_OUTPUT ?? DEFAULT_OUTPUT_PATH;

function runnerEndpoint(baseUrl: string, path: string) {
  if (baseUrl.endsWith("/api/runner")) {
    const [runnerPath, query = ""] = path.replace(/^\//, "").split("?");
    const params = new URLSearchParams(query);
    params.set("runnerPath", runnerPath);
    return `${baseUrl}?${params.toString()}`;
  }
  return `${baseUrl}${path}`;
}

async function postRunner<T>(
  baseUrl: string,
  path: string,
  body: RunnerBody,
  apiKey?: string | null
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["x-osmium-api-key"] = apiKey;
  const response = await fetch(runnerEndpoint(baseUrl, path), {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} ${text}`);
  return JSON.parse(text) as T;
}

async function getRunner<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(runnerEndpoint(baseUrl, path), {
    method: "GET",
    headers: { "content-type": "application/json" }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} ${text}`);
  return JSON.parse(text) as T;
}

async function fetchDemoToken(baseUrl: string) {
  try {
    const result = await getRunner<{ token?: string | null }>(baseUrl, "/demo/operator-token");
    return result.token ?? null;
  } catch {
    return null;
  }
}

function shouldSettle(apiKey: string | null) {
  if (process.env.AGENT_PROOFS_SETTLE === "false") return false;
  if (process.env.AGENT_PROOFS_SETTLE === "true") return true;
  return Boolean(apiKey);
}

async function buildFromDeployedRunner(baseUrl: string): Promise<AgentProofArtifact> {
  const apiKey = process.env.RUNNER_API_KEY ?? (await fetchDemoToken(baseUrl));
  return postRunner<AgentProofArtifact>(
    baseUrl,
    "/agent/proofs",
    { settle: shouldSettle(apiKey) },
    apiKey
  );
}

async function buildFallbackArtifact(error: unknown): Promise<AgentProofArtifact> {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Deployed runner proof capture failed; falling back to local runner logic: ${message}`);
  const apiKey = process.env.RUNNER_API_KEY ?? null;
  return buildAgentProofArtifact(loadConfig(), {
    settle: shouldSettle(apiKey),
    runner: "local-runner-logic"
  });
}

const baseUrl = process.env.AGENT_PROOFS_RUNNER_URL ?? DEFAULT_RUNNER_URL;
const artifact =
  baseUrl === "local"
    ? await buildFallbackArtifact("AGENT_PROOFS_RUNNER_URL=local")
    : await buildFromDeployedRunner(baseUrl).catch(buildFallbackArtifact);

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`Wrote ${OUTPUT_PATH}`);
console.table(
  artifact.rows.map((row) => ({
    case: row.id,
    verdict: row.osmiumVerdict,
    reason: row.denialReason,
    proofType: row.proofType,
    fundsMoved: row.fundsMoved,
    proof: row.txHash ?? row.auditId
  }))
);
