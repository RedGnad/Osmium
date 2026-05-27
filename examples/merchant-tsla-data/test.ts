import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createTslaMerchantServer } from "./server.js";

type ProofArtifact = {
  runner: string;
  rows: Array<{
    id: string;
    caseName: string;
    fundsMoved: boolean;
    proofType: string;
    rawJson?: {
      settlement?: {
        paymentId?: string;
        receiptHash?: string;
      };
    };
  }>;
};

async function readLatestProof() {
  const artifactUrl = new URL("../../proofs/latest-agent-clearance.json", import.meta.url);
  return JSON.parse(await readFile(artifactUrl, "utf8")) as ProofArtifact;
}

async function requestJson(url: string) {
  const response = await fetch(url);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  return { status: response.status, body };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const proof = await readLatestProof();
assert(proof.runner === "deployed-runner", "latest proof artifact must come from deployed-runner");

const valid = proof.rows.find((row) => row.id === "A");
assert(valid?.fundsMoved === true, "case A must include a real settled clearance");
assert(valid.proofType === "on-chain tx", "case A must be an on-chain tx proof");

const paymentId = valid.rawJson?.settlement?.paymentId;
const receiptHash = valid.rawJson?.settlement?.receiptHash;
assert(paymentId && receiptHash, "case A must expose paymentId and receiptHash");

const server = createTslaMerchantServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  const noClearance = await requestJson(`${base}/market-data/TSLA`);
  assert(noClearance.status === 402, "no clearance should return 402 Payment Required");

  const missingReceipt = await requestJson(`${base}/market-data/TSLA?paymentId=${paymentId}`);
  assert(missingReceipt.status === 402, "missing receipt should not unlock merchant data");

  const invalidContext = await requestJson(
    `${base}/market-data/TSLA?paymentId=${paymentId}&receiptHash=${receiptHash}&policyContext=amzn-corporate-action-v1`
  );
  assert(invalidContext.status === 402, "wrong context should not unlock merchant data");

  const unlocked = await requestJson(`${base}/market-data/TSLA?paymentId=${paymentId}&receiptHash=${receiptHash}`);
  assert(unlocked.status === 200, "valid Osmium clearance should unlock merchant data");

  console.table([
    { case: "no clearance", expected: 402, actual: noClearance.status, result: "pass" },
    { case: "missing receipt", expected: 402, actual: missingReceipt.status, result: "pass" },
    { case: "invalid context", expected: 402, actual: invalidContext.status, result: "pass" },
    { case: "valid clearance", expected: 200, actual: unlocked.status, result: "pass" }
  ]);
} finally {
  server.close();
}
