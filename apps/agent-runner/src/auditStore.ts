import type { Address, Hex } from "viem";

export type SettlementAuditRecord = {
  paymentId: Hex;
  asset: "TSLA" | "AMD";
  token: Address;
  receiptHash: Hex;
  txHash: Hex;
  amount: string;
  merchant: Address;
  unlocked: boolean;
  timestamp: number;
};

const records = new Map<Hex, SettlementAuditRecord>();

export function recordSettlement(record: Omit<SettlementAuditRecord, "unlocked" | "timestamp">) {
  records.set(record.paymentId, {
    ...record,
    unlocked: false,
    timestamp: Date.now()
  });
}

export function recordUnlock(paymentId: Hex) {
  const record = records.get(paymentId);
  if (!record) return undefined;
  const unlocked = { ...record, unlocked: true, timestamp: Date.now() };
  records.set(paymentId, unlocked);
  return unlocked;
}

export function getSettlementRecord(paymentId: Hex) {
  return records.get(paymentId);
}

export function listSettlementRecords() {
  return [...records.values()].sort((left, right) => right.timestamp - left.timestamp);
}
