/*
 * /x402/settle/observe — trustless audit ingestion for the self-serve lane.
 *
 * The user's wallet signs settleWithIntent on the SettlementRouter directly.
 * The frontend then posts the resulting txHash to this endpoint. The runner
 * (a) waits for the receipt, (b) verifies the tx targets the canonical
 * SettlementRouter, (c) parses the PaymentSettled event, (d) records the
 * audit row tagged with lane="self-serve" and the actual payer (msg.sender).
 *
 * Trust model: we only believe the chain. Any txHash that did not emit a
 * PaymentSettled event from the Osmium SettlementRouter is silently rejected.
 */
import { parseEventLogs, type Address, type Hex } from "viem";
import { publicClient } from "./client.js";
import type { RunnerConfig } from "./config.js";
import { settlementRouterAbi } from "./settlementAbi.js";
import { recordSettlement } from "./auditStore.js";
import { marketDataQuote, merchantAssetForToken, type MerchantAsset } from "./merchant.js";

type ObserveBody = {
  txHash?: string;
  lane?: "demo" | "self-serve";
};

type ObserveResult =
  | {
      ok: true;
      paymentId: Hex;
      receiptHash: Hex;
      payer: Address;
      asset: MerchantAsset;
      amount: string;
      policyId: string;
      txHash: Hex;
      blockNumber: string;
    }
  | { ok: false; reason: string };

type PaymentSettledArgs = {
  policyId: bigint;
  agent: Address;
  merchant: Address;
  owner: Address;
  token: Address;
  amount: bigint;
  paymentId: Hex;
  intentHash: Hex;
  receiptHash: Hex;
};

function isHex32(value: string | undefined): value is Hex {
  return Boolean(value && /^0x[a-fA-F0-9]{64}$/.test(value));
}

function knownAssetSymbol(token: Address): MerchantAsset | null {
  return merchantAssetForToken(token);
}

export async function observeSettlement(
  config: RunnerConfig,
  body: ObserveBody,
): Promise<ObserveResult> {
  if (!config.settlementRouterAddress) {
    return { ok: false, reason: "router_not_configured" };
  }
  if (!isHex32(body.txHash)) {
    return { ok: false, reason: "invalid_tx_hash" };
  }
  const txHash = body.txHash as Hex;

  const client = publicClient(config);
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
      confirmations: 1,
    });
  } catch {
    return { ok: false, reason: "tx_not_found" };
  }

  if (receipt.status !== "success") {
    return { ok: false, reason: "tx_reverted" };
  }
  if (
    receipt.to?.toLowerCase() !==
    config.settlementRouterAddress.toLowerCase()
  ) {
    return { ok: false, reason: "wrong_router" };
  }

  /* Filter & decode all PaymentSettled events from the router contract. */
  const events = parseEventLogs({
    abi: settlementRouterAbi,
    eventName: "PaymentSettled",
    logs: receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() ===
        config.settlementRouterAddress!.toLowerCase(),
    ),
  });

  if (events.length === 0) {
    return { ok: false, reason: "no_settlement_event" };
  }

  const args = events[0].args as PaymentSettledArgs;
  const assetSymbol = knownAssetSymbol(args.token);
  if (!assetSymbol) {
    return { ok: false, reason: "unknown_token" };
  }

  /* sanity: amount should match a known quote at this exact symbol/price */
  const quote = marketDataQuote(config, assetSymbol);
  if (args.amount.toString() !== quote.priceWei) {
    /* don't fail the audit row — Osmium may extend pricing later — but tag */
  }

  await recordSettlement({
    paymentId: args.paymentId,
    asset: assetSymbol,
    token: args.token,
    receiptHash: args.receiptHash,
    txHash,
    amount: args.amount.toString(),
    merchant: args.merchant,
    payer: args.agent,
    policyId: args.policyId.toString(),
    lane: body.lane === "demo" ? "demo" : "self-serve",
  });

  return {
    ok: true,
    paymentId: args.paymentId,
    receiptHash: args.receiptHash,
    payer: args.agent,
    asset: assetSymbol,
    amount: args.amount.toString(),
    policyId: args.policyId.toString(),
    txHash,
    blockNumber: receipt.blockNumber.toString(),
  };
}
