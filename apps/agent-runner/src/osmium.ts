import { keccak256, toBytes, type Address, type Hex } from "viem";
import { publicClient } from "./client.js";
import { blockReasons, osmiumPolicyEngineAbi } from "./abi.js";
import type { RunnerConfig } from "./config.js";

export type AuthorizationAttempt = {
  label: string;
  intentHash: Hex;
  contextHash: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  paymentId: Hex;
  receiptHash: Hex;
};

export function hashLabel(label: string): Hex {
  return keccak256(toBytes(label));
}

export async function previewAuthorization(config: RunnerConfig, attempt: AuthorizationAttempt) {
  const client = publicClient(config);
  const agentAddress = config.agentAddress ?? "0x0000000000000000000000000000000000000000";
  const [allowed, reason] = await client.readContract({
    address: config.engineAddress,
    abi: osmiumPolicyEngineAbi,
    functionName: "previewAuthorizationWithIntent",
    args: [
      config.policyId,
      attempt.intentHash,
      attempt.contextHash,
      agentAddress,
      attempt.merchant,
      attempt.token,
      attempt.amount,
      attempt.paymentId,
      attempt.receiptHash
    ]
  });

  return {
    allowed,
    reason,
    reasonName: blockReasons[reason] ?? `Unknown(${reason})`
  };
}

export async function authorizePayment(config: RunnerConfig, attempt: AuthorizationAttempt) {
  throw new Error(`Direct authorization is disabled for ${attempt.label}; use SettlementRouter settlement.`);
}

export function demoAttempts(config: RunnerConfig): AuthorizationAttempt[] {
  const runId = Date.now();
  const replayId = hashLabel(`osmium:${runId}:replay`);
  const approvedContextHash = hashLabel("task:osmium-demo-agent-payment");

  return [
    {
      label: "allowed verified merchant with receipt",
      intentHash: config.demoIntentHash,
      contextHash: approvedContextHash,
      merchant: config.merchantAddress,
      token: config.tokenAddress,
      amount: config.maxPerTxWei / 2n,
      paymentId: hashLabel(`osmium:${runId}:allowed`),
      receiptHash: hashLabel(`receipt:${runId}:allowed`)
    },
    {
      label: "blocked unknown merchant",
      intentHash: config.demoIntentHash,
      contextHash: approvedContextHash,
      merchant: config.unknownMerchantAddress,
      token: config.tokenAddress,
      amount: config.maxPerTxWei / 2n,
      paymentId: hashLabel(`osmium:${runId}:unknown-merchant`),
      receiptHash: hashLabel(`receipt:${runId}:unknown-merchant`)
    },
    {
      label: "blocked missing receipt",
      intentHash: config.demoIntentHash,
      contextHash: approvedContextHash,
      merchant: config.merchantAddress,
      token: config.tokenAddress,
      amount: config.maxPerTxWei / 2n,
      paymentId: hashLabel(`osmium:${runId}:missing-receipt`),
      receiptHash: "0x0000000000000000000000000000000000000000000000000000000000000000"
    },
    {
      label: "blocked over max tx",
      intentHash: config.demoIntentHash,
      contextHash: approvedContextHash,
      merchant: config.merchantAddress,
      token: config.tokenAddress,
      amount: config.maxPerTxWei + 1n,
      paymentId: hashLabel(`osmium:${runId}:over-max`),
      receiptHash: hashLabel(`receipt:${runId}:over-max`)
    },
    {
      label: "allowed replay seed",
      intentHash: config.demoIntentHash,
      contextHash: approvedContextHash,
      merchant: config.merchantAddress,
      token: config.tokenAddress,
      amount: config.maxPerTxWei / 3n,
      paymentId: replayId,
      receiptHash: hashLabel(`receipt:${runId}:replay-1`)
    },
    {
      label: "blocked replay",
      intentHash: config.demoIntentHash,
      contextHash: approvedContextHash,
      merchant: config.merchantAddress,
      token: config.tokenAddress,
      amount: config.maxPerTxWei / 3n,
      paymentId: replayId,
      receiptHash: hashLabel(`receipt:${runId}:replay-2`)
    }
  ];
}
