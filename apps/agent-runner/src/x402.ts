import { randomUUID } from "node:crypto";
import { keccak256, toBytes } from "viem";
import type { Address, Hex } from "viem";
import type { RunnerConfig } from "./config.js";
import { publicClient } from "./client.js";
import { blockReasons, osmiumPolicyEngineAbi } from "./abi.js";
import { runLiveSettlement, LIVE_SETTLEMENT_CONTEXT_HASH } from "./liveSettlement.js";
import { marketDataQuote, type MerchantAsset } from "./merchant.js";

export const OSMIUM_X402_VERSION = 2;
export const OSMIUM_X402_SCHEME = "osmium-exact";
export const OSMIUM_X402_SETTLEMENT = "osmium-delegated-vault";

type X402Resource = {
  url: string;
  description: string;
  mimeType: string;
};

type OsmiumPaymentDetails = {
  scheme: typeof OSMIUM_X402_SCHEME;
  network: string;
  asset: Address;
  amount: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  resource: X402Resource;
  extra: {
    assetSymbol: MerchantAsset;
    service: string;
    serviceId: Hex;
    dataHash: Hex;
    receiptHash: Hex;
    paymentId: Hex;
    merchant: Address;
    policyId: string;
    intentHash: Hex;
    contextHash: Hex;
    settlement: typeof OSMIUM_X402_SETTLEMENT;
    note: string;
  };
};

export type OsmiumPaymentRequired = {
  x402Version: typeof OSMIUM_X402_VERSION;
  error: "payment_required";
  protocol: "x402-compatible-osmium";
  accepts: OsmiumPaymentDetails[];
};

type OsmiumPaymentPayload = {
  x402Version: typeof OSMIUM_X402_VERSION;
  accepted: OsmiumPaymentDetails;
  payload: {
    scheme: typeof OSMIUM_X402_SETTLEMENT;
    payer?: Address;
    policyId: string;
    intentHash: Hex;
    contextHash: Hex;
    merchant: Address;
    paymentId: Hex;
    receiptHash: Hex;
  };
  resource: X402Resource;
};

type X402Body = {
  x402Version?: number;
  paymentPayload?: OsmiumPaymentPayload;
  paymentRequirements?: OsmiumPaymentRequired | OsmiumPaymentDetails;
};

function networkId(config: RunnerConfig) {
  return `eip155:${config.chainId}`;
}

export function encodeBase64Json(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeBase64Json<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
}

function paymentDetailsFrom(raw: X402Body["paymentRequirements"]): OsmiumPaymentDetails | undefined {
  if (!raw) return undefined;
  if ("accepts" in raw) return raw.accepts[0];
  return raw;
}

function invalid(reason: string, message: string, payer?: Address) {
  return {
    isValid: false,
    payer: payer ?? "0x0000000000000000000000000000000000000000",
    invalidReason: reason,
    invalidMessage: message
  };
}

function quoteAssetFrom(details: OsmiumPaymentDetails): MerchantAsset {
  return details.extra.assetSymbol;
}

function buildPaymentId(asset: MerchantAsset) {
  return marketDataHash(`x402:${asset}:${Date.now()}:${randomUUID()}`);
}

function marketDataHash(label: string) {
  return keccak256(toBytes(label));
}

export function buildPaymentRequired(config: RunnerConfig, rawAsset: unknown): OsmiumPaymentRequired {
  if (!config.settlementRouterAddress) throw new Error("OSMIUM_SETTLEMENT_ROUTER_ADDRESS is required");
  const quote = marketDataQuote(config, rawAsset);
  const paymentId = buildPaymentId(quote.asset);
  const receiptHash = marketDataHash(`receipt:x402:${paymentId}`);
  const details: OsmiumPaymentDetails = {
    scheme: OSMIUM_X402_SCHEME,
    network: networkId(config),
    asset: quote.token,
    amount: quote.priceWei,
    payTo: config.settlementRouterAddress,
    maxTimeoutSeconds: quote.expiresInSeconds,
    resource: {
      url: `/merchant/market-data?asset=${quote.asset}`,
      description: `${quote.title} through Osmium policy-routed settlement`,
      mimeType: "application/json"
    },
    extra: {
      assetSymbol: quote.asset,
      service: quote.service,
      serviceId: quote.serviceId,
      dataHash: quote.dataHash,
      receiptHash,
      paymentId,
      merchant: quote.merchant,
      policyId: config.settlementDemoPolicyId.toString(),
      intentHash: config.demoIntentHash,
      contextHash: LIVE_SETTLEMENT_CONTEXT_HASH,
      settlement: OSMIUM_X402_SETTLEMENT,
      note: "Custom x402-compatible scheme for delegated vault settlement on Robinhood Chain."
    }
  };

  return {
    x402Version: OSMIUM_X402_VERSION,
    error: "payment_required",
    protocol: "x402-compatible-osmium",
    accepts: [details]
  };
}

export function buildPaymentPayload(paymentRequired: OsmiumPaymentRequired, payer?: Address): OsmiumPaymentPayload {
  const accepted = paymentRequired.accepts[0];
  return {
    x402Version: OSMIUM_X402_VERSION,
    accepted,
    payload: {
      scheme: OSMIUM_X402_SETTLEMENT,
      payer,
      policyId: accepted.extra.policyId,
      intentHash: accepted.extra.intentHash,
      contextHash: accepted.extra.contextHash,
      merchant: accepted.extra.merchant,
      paymentId: accepted.extra.paymentId,
      receiptHash: accepted.extra.receiptHash
    },
    resource: accepted.resource
  };
}

function readBody(body: X402Body) {
  const paymentPayload = body.paymentPayload;
  const details = paymentDetailsFrom(body.paymentRequirements) ?? paymentPayload?.accepted;
  return { paymentPayload, details };
}

export async function verifyX402Payment(config: RunnerConfig, body: X402Body) {
  const { paymentPayload, details } = readBody(body);
  if (body.x402Version !== OSMIUM_X402_VERSION && paymentPayload?.x402Version !== OSMIUM_X402_VERSION) {
    return invalid("invalid_x402_version", "Osmium x402 facilitator expects x402Version 2.");
  }
  if (!paymentPayload || !details) {
    return invalid("invalid_payload", "paymentPayload and paymentRequirements are required.");
  }
  if (!config.agentAddress) return invalid("invalid_payload", "AGENT_ADDRESS is required.");
  if (!config.settlementRouterAddress) return invalid("invalid_payment_requirements", "SettlementRouter is not configured.");
  if (details.scheme !== OSMIUM_X402_SCHEME) return invalid("invalid_scheme", "Unsupported Osmium x402 scheme.", config.agentAddress);
  if (details.network !== networkId(config)) return invalid("invalid_network", "Unsupported x402 network.", config.agentAddress);
  if (details.payTo.toLowerCase() !== config.settlementRouterAddress.toLowerCase()) {
    return invalid("invalid_payment_requirements", "Payment must settle through the OsmiumSettlementRouter.", config.agentAddress);
  }
  if (paymentPayload.payload.scheme !== OSMIUM_X402_SETTLEMENT) {
    return invalid("invalid_payload", "Payment payload must use Osmium delegated vault settlement.", config.agentAddress);
  }

  const quote = marketDataQuote(config, quoteAssetFrom(details));
  if (details.asset.toLowerCase() !== quote.token.toLowerCase()) {
    return invalid("invalid_payment_requirements", "Payment asset does not match the merchant quote.", config.agentAddress);
  }
  if (details.amount !== quote.priceWei) {
    return invalid("invalid_payment_requirements", "Payment amount does not match the merchant quote.", config.agentAddress);
  }
  if (paymentPayload.payload.paymentId !== details.extra.paymentId || paymentPayload.payload.receiptHash !== details.extra.receiptHash) {
    return invalid("invalid_payload", "Payment payload is not bound to the server payment requirements.", config.agentAddress);
  }

  const client = publicClient(config);
  const [allowed, reason] = await client.readContract({
    address: config.engineAddress,
    abi: osmiumPolicyEngineAbi,
    functionName: "previewAuthorizationWithIntent",
    args: [
      config.settlementDemoPolicyId,
      config.demoIntentHash,
      LIVE_SETTLEMENT_CONTEXT_HASH,
      config.agentAddress,
      quote.merchant,
      quote.token,
      BigInt(quote.priceWei),
      details.extra.paymentId,
      details.extra.receiptHash
    ]
  });

  if (!allowed) {
    const reasonName = blockReasons[reason] ?? `Unknown(${reason})`;
    return invalid(`policy_${reasonName}`, `PolicyEngine preview denied settlement: ${reasonName}.`, config.agentAddress);
  }

  return {
    isValid: true,
    payer: config.agentAddress,
    network: networkId(config),
    scheme: OSMIUM_X402_SCHEME,
    settlement: OSMIUM_X402_SETTLEMENT,
    paymentId: details.extra.paymentId,
    receiptHash: details.extra.receiptHash
  };
}

export async function settleX402Payment(config: RunnerConfig, body: X402Body) {
  const verification = await verifyX402Payment(config, body);
  const { details } = readBody(body);
  if (!("isValid" in verification) || !verification.isValid || !details) {
    const failed = verification as {
      payer: Address;
      invalidReason?: string;
      invalidMessage?: string;
    };
    return {
      success: false,
      payer: failed.payer,
      network: networkId(config),
      errorReason: failed.invalidReason ?? "invalid_payload",
      errorMessage: failed.invalidMessage ?? "Payment verification failed.",
      amount: details?.amount ?? "0"
    };
  }

  const settlement = (await runLiveSettlement({
    amount: BigInt(details.amount),
    paymentId: details.extra.paymentId,
    receiptHash: details.extra.receiptHash
  })) as {
    transactions: { settle: Hex };
    paymentId: Hex;
    receiptHash: Hex;
    amount: string;
  };

  return {
    success: true,
    payer: verification.payer,
    transaction: settlement.transactions.settle,
    network: networkId(config),
    amount: details.amount,
    paymentId: settlement.paymentId,
    receiptHash: settlement.receiptHash,
    settlement
  };
}

export function supportedX402(config: RunnerConfig) {
  return {
    kinds: [
      {
        x402Version: OSMIUM_X402_VERSION,
        scheme: OSMIUM_X402_SCHEME,
        network: networkId(config),
        assets: ["TSLA", "AMD", "AMZN"],
        settlement: OSMIUM_X402_SETTLEMENT
      }
    ],
    note: "Osmium is x402-compatible for Robinhood Chain delegated vault settlement. It does not use the CDP facilitator."
  };
}
