import type { Address, Hex } from "viem";
import type { RunnerConfig } from "./config.js";
import { readLiveSettlementProof } from "./liveSettlement.js";
import { hashLabel } from "./osmium.js";
import { getSettlementRecord, listSettlementRecords, recordMerchantReceipt, recordSettlement, recordUnlock } from "./auditStore.js";
import { buildMerchantReceiptAttestation } from "./merchantReceipt.js";

const robinhoodAssets = {
  TSLA: {
    token: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" as Address,
    service: "market_data_snapshot",
    title: "TSLA market data snapshot",
    resourceKind: "market_data",
    responseLabel: "verified_market_data_demo"
  },
  AMD: {
    token: "0x71178BAc73cBeb415514eB542a8995b82669778d" as Address,
    service: "risk_snapshot",
    title: "AMD risk snapshot",
    resourceKind: "risk",
    responseLabel: "ai_infra_risk_snapshot"
  },
  AMZN: {
    token: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02" as Address,
    service: "corporate_action_alert",
    title: "AMZN corporate-action alert",
    resourceKind: "corporate_action",
    responseLabel: "corporate_action_alert_demo"
  }
} as const;

export type MerchantAsset = keyof typeof robinhoodAssets;

function normalizeAsset(asset: unknown): MerchantAsset {
  const symbol = String(asset ?? "TSLA").toUpperCase();
  if (symbol !== "TSLA" && symbol !== "AMD" && symbol !== "AMZN") {
    throw new Error("unsupported merchant asset");
  }
  return symbol;
}

export function marketDataQuote(config: RunnerConfig, rawAsset: unknown) {
  const asset = normalizeAsset(rawAsset);
  const descriptor = robinhoodAssets[asset];
  const serviceId = hashLabel(`merchant:${asset}:${descriptor.service}`);
  const dataHash = hashLabel(`merchant:${asset}:${descriptor.service}:response`);

  return {
    asset,
    service: descriptor.service,
    resourceKind: descriptor.resourceKind,
    title: descriptor.title,
    price: "0.25",
    priceWei: "250000000000000000",
    token: descriptor.token,
    merchant: config.merchantAddress,
    serviceId,
    dataHash,
    receiptHash: hashLabel(`receipt:${asset}:${descriptor.service}:${serviceId}`),
    receiptMode: "required",
    receiptStandard: "EIP-712 MerchantReceipt",
    expiresInSeconds: 300
  };
}

export async function unlockMarketData(config: RunnerConfig, body: { asset?: unknown; paymentId?: Hex; receiptHash?: Hex }) {
  const quote = marketDataQuote(config, body.asset);
  const proof = (await readLiveSettlementProof()) as {
    paymentId: Hex;
    receiptHash: Hex;
    token: Address;
    transactions?: { settle?: Hex };
    replay: { blocked: boolean; reasonName: string };
  };

  const paymentId = body.paymentId ?? proof.paymentId;
  const receiptHash = body.receiptHash ?? proof.receiptHash;
  const stored = await getSettlementRecord(paymentId);
  const matchesStored =
    stored?.asset === quote.asset && stored.receiptHash === receiptHash && stored.token.toLowerCase() === quote.token.toLowerCase();
  const matchesLatestProof =
    proof.token.toLowerCase() === quote.token.toLowerCase() && paymentId === proof.paymentId && receiptHash === proof.receiptHash;
  const unlocked = Boolean(matchesStored || matchesLatestProof);
  if (unlocked && !stored) {
    await recordSettlement({
      paymentId,
      asset: quote.asset,
      token: quote.token,
      receiptHash,
      txHash: proof.transactions?.settle ?? "0x",
      amount: quote.priceWei,
      merchant: quote.merchant,
      service: quote.service,
      title: quote.title,
      responseHash: quote.dataHash
    });
  }
  const merchantReceipt = unlocked
    ? await buildMerchantReceiptAttestation(config, {
        merchant: quote.merchant,
        asset: quote.token,
        amount: quote.priceWei,
        resourceId: quote.serviceId,
        responseHash: quote.dataHash,
        paymentId,
        settlementTxHash: stored?.txHash ?? proof.transactions?.settle
      })
    : null;
  if (unlocked) {
    await recordUnlock(paymentId);
    if (merchantReceipt) await recordMerchantReceipt(paymentId, merchantReceipt);
  }

  return {
    asset: quote.asset,
    service: quote.service,
    title: quote.title,
    merchant: quote.merchant,
    paymentId,
    receiptHash,
    dataHash: quote.dataHash,
    unlocked,
    merchantReceipt,
    replayProof: proof.replay,
    payload: unlocked
      ? {
          symbol: quote.asset,
          snapshot: descriptorPayload(quote.asset),
          source: "Osmium Verified Market Data API",
          settlement: "receipt verified on Robinhood Chain"
        }
      : null
  };
}

export async function marketDataResource(config: RunnerConfig, query: { asset?: unknown; paymentId?: unknown; receiptHash?: unknown }) {
  const quote = marketDataQuote(config, query.asset);
  const paymentId = typeof query.paymentId === "string" && query.paymentId.startsWith("0x") ? (query.paymentId as Hex) : undefined;
  const receiptHash = typeof query.receiptHash === "string" && query.receiptHash.startsWith("0x") ? (query.receiptHash as Hex) : undefined;

  if (paymentId && receiptHash) {
    const unlocked = await unlockMarketData(config, { asset: quote.asset, paymentId, receiptHash });
    if (unlocked.unlocked) {
      return { status: 200, body: unlocked };
    }
  }

  return {
    status: 402,
    body: {
      error: "payment_required",
      protocol: "x402-style-demo",
      asset: quote.asset,
      service: quote.service,
      payment: {
        network: "robinhood-chain-testnet",
        chainId: config.chainId,
        token: quote.token,
        merchant: quote.merchant,
        amount: quote.priceWei,
        displayAmount: `${quote.price} ${quote.asset}`,
        serviceId: quote.serviceId,
        dataHash: quote.dataHash,
        receiptHash: quote.receiptHash,
        settlement: "OsmiumSettlementRouter",
        receiptStandard: quote.receiptStandard
      }
    }
  };
}

export async function merchantAuditLog() {
  return listSettlementRecords();
}

function descriptorPayload(asset: MerchantAsset) {
  return robinhoodAssets[asset].responseLabel;
}
