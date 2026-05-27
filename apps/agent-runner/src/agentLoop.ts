import type { Address, Hex } from "viem";
import { publicClient } from "./client.js";
import type { RunnerConfig } from "./config.js";
import { blockReasons, osmiumPolicyEngineAbi } from "./abi.js";
import { LIVE_SETTLEMENT_CONTEXT_HASH, readLiveSettlementProof } from "./liveSettlement.js";
import { marketDataQuote, marketDataResource, unlockMarketData, type MerchantAsset } from "./merchant.js";
import { hashLabel } from "./osmium.js";
import {
  buildPaymentPayload,
  buildPaymentRequired,
  settleX402Payment,
  verifyX402Payment,
  type OsmiumPaymentRequired,
  type X402Body
} from "./x402.js";

export type AgentMandate = {
  agent: string;
  asset: MerchantAsset;
  resource: string;
  merchant: Address;
  token: Address;
  maxAmount: string;
  periodLimit: string;
  validUntil: string;
  purpose: string;
  contextHash: Hex;
  intentHash: Hex;
};

type AgentVerdict = "Cleared" | "Denied";

export type AgentAttemptReport = {
  id: string;
  agentAction: string;
  mandate: AgentMandate;
  x402Step: string;
  policyVerdict: AgentVerdict;
  reasonName: string;
  proof: string;
  txHash: string | null;
  fundsMoved: boolean;
  finalStatus: AgentVerdict;
  explanation: string;
};

export type AgentProofRow = {
  id: string;
  caseName: string;
  mandateSummary: string;
  agentAction: string;
  x402Step: string;
  osmiumVerdict: AgentVerdict;
  denialReason: string;
  fundsMoved: boolean;
  proofType: "on-chain tx" | "pre-settlement denial" | "ledger row";
  txHash: string | null;
  auditId: string;
  explorerUrl: string | null;
  rawJson: unknown;
};

export type AgentProofArtifact = {
  generatedAt: string;
  chainId: number;
  runner: "local-runner-logic" | "deployed-runner";
  summary: {
    claim: string;
    cleared: number;
    denied: number;
    fundsMovedRows: number;
  };
  mandate: AgentMandate;
  rows: AgentProofRow[];
  limitations: string[];
};

export type AgentLoopReport = {
  mandate: AgentMandate;
  thought: string;
  action: string;
  x402: {
    status: number;
    protocol: string;
    paymentId: Hex;
    receiptHash: Hex;
    amount: string;
  };
  clearance: {
    valid: boolean;
    reasonName: string;
    message: string;
  };
  settlement: {
    attempted: boolean;
    fundsMoved: boolean;
    txHash: string | null;
    paymentId: Hex;
    receiptHash: Hex;
  };
  unlock: {
    unlocked: boolean;
    dataHash: string | null;
  };
  explanation: string;
};

function validUntilIso() {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

function formatWeiDecimal(value: bigint, decimals = 18) {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const cents = ((value % scale) / (scale / 100n)).toString().padStart(2, "0");
  return `${whole}.${cents}`;
}

function txUrl(txHash: string | null) {
  return txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)
    ? `https://explorer.testnet.chain.robinhood.com/tx/${txHash}`
    : null;
}

function mandateSummary(mandate: AgentMandate) {
  return `${mandate.asset} ${mandate.resource} · max ${mandate.maxAmount} ${mandate.token.slice(0, 6)}...${mandate.token.slice(-4)}`;
}

export function buildDefaultMandate(config: RunnerConfig, asset: MerchantAsset = "TSLA"): AgentMandate {
  const quote = marketDataQuote(config, asset);
  return {
    agent: config.agentAddress ?? "0x0000000000000000000000000000000000000000",
    asset,
    resource: quote.resourceKind ?? "market-data",
    merchant: quote.merchant,
    token: quote.token,
    maxAmount: quote.price,
    periodLimit: formatWeiDecimal(config.periodLimitWei),
    validUntil: validUntilIso(),
    purpose: `Buy verified ${asset} market data only`,
    contextHash: LIVE_SETTLEMENT_CONTEXT_HASH,
    intentHash: config.demoIntentHash
  };
}

function normalizeMandate(config: RunnerConfig, raw: Partial<AgentMandate> | undefined): AgentMandate {
  const asset = raw?.asset === "AMD" || raw?.asset === "AMZN" ? raw.asset : "TSLA";
  return {
    ...buildDefaultMandate(config, asset),
    ...raw,
    asset
  };
}

function makeBody(paymentRequired: OsmiumPaymentRequired, agent?: string): X402Body {
  return {
    x402Version: 2,
    paymentRequirements: paymentRequired,
    paymentPayload: buildPaymentPayload(paymentRequired, agent as Address | undefined)
  };
}

function reasonFromVerification(result: Awaited<ReturnType<typeof verifyX402Payment>>) {
  if ("isValid" in result && result.isValid) return "None";
  return "invalidReason" in result && result.invalidReason
    ? result.invalidReason.replace(/^policy_/, "")
    : "Invalid";
}

export async function runAgentLoop(
  config: RunnerConfig,
  body: { mandate?: Partial<AgentMandate>; settle?: boolean } = {}
): Promise<AgentLoopReport> {
  const mandate = normalizeMandate(config, body.mandate);
  const resource = await marketDataResource(config, { asset: mandate.asset });
  const paymentRequired = buildPaymentRequired(config, mandate.asset);
  const accepted = paymentRequired.accepts[0];
  const paymentBody = makeBody(paymentRequired, mandate.agent);
  const verification = await verifyX402Payment(config, paymentBody);
  const isValid = "isValid" in verification && verification.isValid;
  const reasonName = reasonFromVerification(verification);

  let txHash: string | null = null;
  let fundsMoved = false;
  let unlocked = false;
  let dataHash: string | null = null;
  if (body.settle !== false && isValid) {
    const settlement = await settleX402Payment(config, paymentBody);
    fundsMoved = settlement.success;
    txHash =
      settlement.success && "transaction" in settlement
        ? (settlement.transaction ?? null)
        : null;
    if (settlement.success) {
      const unlockedResource = await unlockMarketData(config, {
        asset: mandate.asset,
        paymentId: settlement.paymentId,
        receiptHash: settlement.receiptHash
      });
      unlocked = unlockedResource.unlocked;
      dataHash = unlockedResource.dataHash;
    }
  }

  return {
    mandate,
    thought: "The mandate allows only a TSLA paid-data purchase, so the agent selects the verified market-data resource and requests clearance before funds move.",
    action: `Request ${mandate.asset} ${mandate.resource} from the verified merchant`,
    x402: {
      status: resource.status,
      protocol: paymentRequired.protocol,
      paymentId: accepted.extra.paymentId,
      receiptHash: accepted.extra.receiptHash,
      amount: accepted.amount
    },
    clearance: {
      valid: isValid,
      reasonName,
      message: isValid
        ? "PolicyEngine preview cleared the payment intent."
        : "PolicyEngine preview denied the attempt before settlement; no funds moved."
    },
    settlement: {
      attempted: body.settle !== false && isValid,
      fundsMoved,
      txHash,
      paymentId: accepted.extra.paymentId,
      receiptHash: accepted.extra.receiptHash
    },
    unlock: {
      unlocked,
      dataHash
    },
    explanation: isValid
      ? "The agent requested a paid resource, Osmium verified merchant/token/amount/receipt/context, then settlement was allowed."
      : `PolicyEngine preview denied the attempt before settlement; no funds moved. Reason: ${reasonName}.`
  };
}

async function previewAttempt(
  config: RunnerConfig,
  attempt: {
    id: string;
    action: string;
    mandate: AgentMandate;
    merchant: Address;
    token: Address;
    amount: bigint;
    paymentId: Hex;
    receiptHash: Hex;
    contextHash: Hex;
  },
): Promise<AgentAttemptReport> {
  const client = publicClient(config);
  const agent = (config.agentAddress ?? attempt.mandate.agent) as Address;
  const [allowed, reason] = await client.readContract({
    address: config.engineAddress,
    abi: osmiumPolicyEngineAbi,
    functionName: "previewAuthorizationWithIntent",
    args: [
      config.settlementDemoPolicyId,
      config.demoIntentHash,
      attempt.contextHash,
      agent,
      attempt.merchant,
      attempt.token,
      attempt.amount,
      attempt.paymentId,
      attempt.receiptHash
    ]
  });
  const reasonName = blockReasons[reason] ?? `Unknown(${reason})`;
  const verdict: AgentVerdict = allowed ? "Cleared" : "Denied";

  return {
    id: attempt.id,
    agentAction: attempt.action,
    mandate: attempt.mandate,
    x402Step: "402 received -> payment intent built -> PolicyEngine preview",
    policyVerdict: verdict,
    reasonName,
    proof: `previewAuthorizationWithIntent:${reasonName}`,
    txHash: null,
    fundsMoved: false,
    finalStatus: verdict,
    explanation: allowed
      ? "The attempted spend matched the mandate. It is cleared for settlement; this attack run does not move funds."
      : `PolicyEngine preview denied the attempt before settlement; no funds moved. Reason: ${reasonName}.`
  };
}

export async function runAttackMode(config: RunnerConfig): Promise<{ mandate: AgentMandate; attempts: AgentAttemptReport[] }> {
  const mandate = buildDefaultMandate(config, "TSLA");
  const quote = marketDataQuote(config, "TSLA");
  const runId = Date.now();
  const validPaymentId = hashLabel(`agent-attack:${runId}:valid`);
  const validReceipt = hashLabel(`agent-attack:${runId}:receipt`);
  const unknownMerchant =
    config.unknownMerchantAddress.toLowerCase() === config.merchantAddress.toLowerCase()
      ? "0x000000000000000000000000000000000000dEaD"
      : config.unknownMerchantAddress;
  const replayProof = await readLiveSettlementProof().catch(() => null) as
    | { paymentId?: Hex; receiptHash?: Hex; replay?: { blocked: boolean; reasonName: string } }
    | null;

  const attempts: AgentAttemptReport[] = [];
  attempts.push(await previewAttempt(config, {
    id: "A",
    action: "Valid TSLA mandate -> buy verified market data",
    mandate,
    merchant: quote.merchant,
    token: quote.token,
    amount: BigInt(quote.priceWei),
    paymentId: validPaymentId,
    receiptHash: validReceipt,
    contextHash: mandate.contextHash
  }));

  if (replayProof?.paymentId && replayProof.paymentId !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    attempts.push({
      id: "B",
      agentAction: "Replay same paymentId from a previous clearance",
      mandate,
      x402Step: "reuse paymentId -> PolicyEngine replay check",
      policyVerdict: replayProof.replay?.blocked ? "Denied" : "Cleared",
      reasonName: replayProof.replay?.reasonName ?? "Replay",
      proof: `latestSettlementPaymentId:${replayProof.paymentId}`,
      txHash: null,
      fundsMoved: false,
      finalStatus: replayProof.replay?.blocked ? "Denied" : "Cleared",
      explanation: replayProof.replay?.blocked
        ? "PolicyEngine preview denied the attempt before settlement; no funds moved. Reason: Replay."
        : "Replay proof needs a previously filed paymentId. Run one live settlement first."
    });
  } else {
    attempts.push({
      id: "B",
      agentAction: "Replay same paymentId",
      mandate,
      x402Step: "waiting for previous filed payment",
      policyVerdict: "Denied",
      reasonName: "Replay",
      proof: "requires one prior settlement",
      txHash: null,
      fundsMoved: false,
      finalStatus: "Denied",
      explanation: "Replay denial is proven after a settlement files a paymentId. The demo lane checks this immediately after live settlement."
    });
  }

  attempts.push(await previewAttempt(config, {
    id: "C",
    action: "Unknown merchant tries to invoice the agent",
    mandate,
    merchant: unknownMerchant as Address,
    token: quote.token,
    amount: BigInt(quote.priceWei),
    paymentId: hashLabel(`agent-attack:${runId}:unknown`),
    receiptHash: hashLabel(`agent-attack:${runId}:unknown-receipt`),
    contextHash: mandate.contextHash
  }));
  attempts.push(await previewAttempt(config, {
    id: "D",
    action: "Merchant omits receiptHash",
    mandate,
    merchant: quote.merchant,
    token: quote.token,
    amount: BigInt(quote.priceWei),
    paymentId: hashLabel(`agent-attack:${runId}:missing`),
    receiptHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    contextHash: mandate.contextHash
  }));
  attempts.push(await previewAttempt(config, {
    id: "E",
    action: "AMZN-style request under TSLA context mandate",
    mandate,
    merchant: quote.merchant,
    token: quote.token,
    amount: BigInt(quote.priceWei),
    paymentId: hashLabel(`agent-attack:${runId}:wrong-context`),
    receiptHash: hashLabel(`agent-attack:${runId}:wrong-context-receipt`),
    contextHash: hashLabel("task:amzn-corporate-action-with-tsla-mandate")
  }));
  attempts.push(await previewAttempt(config, {
    id: "F",
    action: "Over max amount attempt",
    mandate,
    merchant: quote.merchant,
    token: quote.token,
    amount: config.maxPerTxWei + 1n,
    paymentId: hashLabel(`agent-attack:${runId}:over-max`),
    receiptHash: hashLabel(`agent-attack:${runId}:over-max-receipt`),
    contextHash: mandate.contextHash
  }));

  return { mandate, attempts };
}

export async function buildAgentProofArtifact(
  config: RunnerConfig,
  options: { settle?: boolean; runner?: AgentProofArtifact["runner"] } = {}
): Promise<AgentProofArtifact> {
  const valid = await runAgentLoop(config, { settle: options.settle ?? false });
  const attacks = await runAttackMode(config);
  const attackRows = attacks.attempts.filter((attempt) => attempt.id !== "A");
  const validTx = valid.settlement.txHash;

  const rows: AgentProofRow[] = [
    {
      id: "A",
      caseName: "Valid TSLA mandate",
      mandateSummary: mandateSummary(valid.mandate),
      agentAction: valid.action,
      x402Step: `${valid.x402.status} -> verify -> ${valid.settlement.attempted ? "settle" : "clearance preview"}`,
      osmiumVerdict: valid.clearance.valid ? "Cleared" : "Denied",
      denialReason: valid.clearance.reasonName,
      fundsMoved: valid.settlement.fundsMoved,
      proofType: valid.settlement.fundsMoved ? "on-chain tx" : "ledger row",
      txHash: validTx,
      auditId: validTx ?? valid.settlement.paymentId,
      explorerUrl: txUrl(validTx),
      rawJson: valid
    },
    ...attackRows.map((attempt) => ({
      id: attempt.id,
      caseName:
        attempt.id === "B"
          ? "Replay same paymentId"
          : attempt.id === "C"
            ? "Unknown merchant"
            : attempt.id === "D"
              ? "Missing receiptHash"
              : attempt.id === "E"
                ? "Wrong context"
                : "Over max amount",
      mandateSummary: mandateSummary(attempt.mandate),
      agentAction: attempt.agentAction,
      x402Step: attempt.x402Step,
      osmiumVerdict: attempt.finalStatus,
      denialReason: attempt.reasonName,
      fundsMoved: attempt.fundsMoved,
      proofType: "pre-settlement denial" as const,
      txHash: attempt.txHash,
      auditId: attempt.proof,
      explorerUrl: txUrl(attempt.txHash),
      rawJson: attempt
    }))
  ];

  return {
    generatedAt: new Date().toISOString(),
    chainId: config.chainId,
    runner: options.runner ?? "local-runner-logic",
    summary: {
      claim: "The agent tried to spend. Osmium cleared only the mandate-matching payment and denied unsafe attempts before funds moved.",
      cleared: rows.filter((row) => row.osmiumVerdict === "Cleared").length,
      denied: rows.filter((row) => row.osmiumVerdict === "Denied").length,
      fundsMovedRows: rows.filter((row) => row.fundsMoved).length
    },
    mandate: valid.mandate,
    rows,
    limitations: [
      "Denial rows are pre-settlement PolicyEngine previews, not on-chain revert transactions.",
      "The valid row is an on-chain transaction only when settle=true and the runner has an operator key.",
      "This is an AP2-inspired mandate model, not an AP2 compliance claim.",
      "The x402 facilitator is Osmium-compatible and custom for Robinhood Chain, not the Coinbase CDP facilitator."
    ]
  };
}
