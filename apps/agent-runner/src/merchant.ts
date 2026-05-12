import type { Address, Hex } from "viem";
import type { RunnerConfig } from "./config.js";
import { readLiveSettlementProof } from "./liveSettlement.js";
import { hashLabel } from "./osmium.js";
import { getSettlementRecord, listSettlementRecords, recordSettlement, recordUnlock } from "./auditStore.js";

const robinhoodAssets = {
  TSLA: {
    token: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" as Address,
    service: "market_data_snapshot",
    title: "TSLA market data snapshot"
  },
  AMD: {
    token: "0x71178BAc73cBeb415514eB542a8995b82669778d" as Address,
    service: "market_data_snapshot",
    title: "AMD market data snapshot"
  }
} as const;

export type MerchantAsset = keyof typeof robinhoodAssets;

function normalizeAsset(asset: unknown): MerchantAsset {
  const symbol = String(asset ?? "TSLA").toUpperCase();
  if (symbol !== "TSLA" && symbol !== "AMD") {
    throw new Error("unsupported merchant asset");
  }
  return symbol;
}

export function marketDataQuote(config: RunnerConfig, rawAsset: unknown) {
  const asset = normalizeAsset(rawAsset);
  const descriptor = robinhoodAssets[asset];
  const serviceId = hashLabel(`merchant:${asset}:market-data`);
  const dataHash = hashLabel(`merchant:${asset}:market-data:snapshot`);

  return {
    asset,
    service: descriptor.service,
    title: descriptor.title,
    price: "0.25",
    priceWei: "250000000000000000",
    token: descriptor.token,
    merchant: config.merchantAddress,
    serviceId,
    dataHash,
    receiptHash: hashLabel(`receipt:${asset}:market-data:${serviceId}`),
    receiptMode: "required",
    expiresInSeconds: 300
  };
}

export async function unlockMarketData(config: RunnerConfig, body: { asset?: unknown; paymentId?: Hex; receiptHash?: Hex }) {
  const quote = marketDataQuote(config, body.asset);
  const proof = (await readLiveSettlementProof()) as {
    paymentId: Hex;
    receiptHash: Hex;
    token: Address;
    replay: { blocked: boolean; reasonName: string };
  };

  const paymentId = body.paymentId ?? proof.paymentId;
  const receiptHash = body.receiptHash ?? proof.receiptHash;
  const stored = getSettlementRecord(paymentId);
  const matchesStored =
    stored?.asset === quote.asset && stored.receiptHash === receiptHash && stored.token.toLowerCase() === quote.token.toLowerCase();
  const matchesLatestProof =
    proof.token.toLowerCase() === quote.token.toLowerCase() && paymentId === proof.paymentId && receiptHash === proof.receiptHash;
  const unlocked = Boolean(matchesStored || matchesLatestProof);
  if (unlocked && !stored) {
    recordSettlement({
      paymentId,
      asset: quote.asset,
      token: quote.token,
      receiptHash,
      txHash: "0x",
      amount: quote.priceWei,
      merchant: quote.merchant
    });
  }
  if (unlocked) recordUnlock(paymentId);

  return {
    asset: quote.asset,
    service: quote.service,
    merchant: quote.merchant,
    paymentId,
    receiptHash,
    dataHash: quote.dataHash,
    unlocked,
    replayProof: proof.replay,
    payload: unlocked
      ? {
          symbol: quote.asset,
          snapshot: "verified_market_data_demo",
          source: "Osmium Verified Market Data API",
          settlement: "receipt verified on Robinhood Chain"
        }
      : null
  };
}

export function merchantAuditLog() {
  return listSettlementRecords();
}
