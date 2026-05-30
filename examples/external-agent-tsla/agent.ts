import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createTslaMerchantServer } from "../merchant-tsla-data/server.js";

const DEFAULT_RUNNER_URL = "https://osmium-agent-runner.vercel.app/api/runner";

type Mandate = {
  agent: string;
  asset: "TSLA";
  resource: "market-data";
  merchant: string;
  token: string;
  maxAmount: string;
  periodLimit: string;
  validUntil: string;
  purpose: string;
  contextHash: string;
  intentHash: string;
};

type ProofArtifact = {
  runner: string;
  rows: Array<{
    id: string;
    caseName: string;
    fundsMoved: boolean;
    proofType: string;
    txHash?: string | null;
    rawJson?: {
      settlement?: {
        paymentId?: string;
        receiptHash?: string;
        txHash?: string;
      };
    };
  }>;
};

type AgentCase = {
  case: string;
  expected: number | string;
  actual: number | string;
  passed: boolean;
};

export type ExternalAgentReport = {
  mandate: Mandate;
  runner: string;
  proofTx: string;
  paymentId: string;
  receiptHash: string;
  cases: AgentCase[];
};

function runnerEndpoint(runnerUrl: string, path: string) {
  const base = runnerUrl.replace(/\/$/, "");
  if (base.endsWith("/api/runner")) {
    const [runnerPath, query = ""] = path.replace(/^\//, "").split("?");
    const params = new URLSearchParams(query);
    params.set("runnerPath", runnerPath);
    return `${base}?${params.toString()}`;
  }
  return `${base}${path}`;
}

async function readJson<T>(relativePath: string) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8")) as T;
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  return { status: response.status, body, headers: response.headers };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function captureLiveProof(runnerUrl: string): Promise<ProofArtifact> {
  const tokenResponse = await requestJson(runnerEndpoint(runnerUrl, "/demo/operator-token"));
  const token = typeof tokenResponse.body === "object" && tokenResponse.body && "token" in tokenResponse.body
    ? String((tokenResponse.body as { token?: string }).token)
    : "";
  assert(token, "deployed runner did not expose a demo operator token");

  const proofResponse = await requestJson(runnerEndpoint(runnerUrl, "/agent/proofs"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-osmium-api-key": token
    },
    body: JSON.stringify({ settle: true })
  });
  assert(proofResponse.status === 200, `live proof capture failed with HTTP ${proofResponse.status}`);
  return proofResponse.body as ProofArtifact;
}

async function loadProofArtifact(runnerUrl: string) {
  if (process.env.EXTERNAL_AGENT_LIVE_SETTLE === "true") return captureLiveProof(runnerUrl);
  return readJson<ProofArtifact>("../../proofs/latest-agent-clearance.json");
}

export async function runExternalAgentDemo() {
  const runnerUrl = process.env.OSMIUM_RUNNER_URL ?? DEFAULT_RUNNER_URL;
  const mandate = await readJson<Mandate>("./mandate.json");
  const proof = await loadProofArtifact(runnerUrl);
  assert(proof.runner === "deployed-runner", "latest proof must come from deployed-runner");

  const valid = proof.rows.find((row) => row.id === "A");
  assert(valid?.fundsMoved === true, "valid proof row must have moved funds");
  assert(valid.proofType === "on-chain tx", "valid proof row must be an on-chain tx");

  const paymentId = valid.rawJson?.settlement?.paymentId;
  const receiptHash = valid.rawJson?.settlement?.receiptHash;
  const proofTx = valid.txHash ?? valid.rawJson?.settlement?.txHash;
  assert(paymentId && receiptHash && proofTx, "valid proof row must include tx, paymentId and receiptHash");

  const merchantServer = createTslaMerchantServer({ runnerUrl });
  await new Promise<void>((resolve) => merchantServer.listen(0, "127.0.0.1", resolve));

  try {
    const address = merchantServer.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const noClearance = await requestJson(`${base}/market-data/TSLA`);
    const missingReceipt = await requestJson(`${base}/market-data/TSLA?paymentId=${paymentId}`);
    const wrongContext = await requestJson(
      `${base}/market-data/TSLA?paymentId=${paymentId}&receiptHash=${receiptHash}&policyContext=amzn-corporate-action-v1`
    );
    const fakePaymentId = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const fakeReceiptHash = "0x2222222222222222222222222222222222222222222222222222222222222222";
    const bypass = await requestJson(`${base}/market-data/TSLA?paymentId=${fakePaymentId}&receiptHash=${fakeReceiptHash}`);
    const unlocked = await requestJson(`${base}/market-data/TSLA?paymentId=${paymentId}&receiptHash=${receiptHash}`);

    const cases: AgentCase[] = [
      { case: "no clearance", expected: 402, actual: noClearance.status, passed: noClearance.status === 402 },
      { case: "missing receipt", expected: 402, actual: missingReceipt.status, passed: missingReceipt.status === 402 },
      { case: "wrong context", expected: 402, actual: wrongContext.status, passed: wrongContext.status === 402 },
      { case: "bypass with fake proof", expected: 402, actual: bypass.status, passed: bypass.status === 402 },
      { case: "valid Osmium receipt", expected: 200, actual: unlocked.status, passed: unlocked.status === 200 }
    ];

    return {
      mandate,
      runner: proof.runner,
      proofTx,
      paymentId,
      receiptHash,
      cases
    } satisfies ExternalAgentReport;
  } finally {
    merchantServer.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runExternalAgentDemo();
  console.log("External TSLA agent used Osmium as the payment clearance layer.");
  console.log(
    JSON.stringify(
      {
        runner: report.runner,
        mandate: report.mandate,
        proofTx: report.proofTx,
        paymentId: report.paymentId,
        receiptHash: report.receiptHash
      },
      null,
      2
    )
  );
  console.table(report.cases);
}
