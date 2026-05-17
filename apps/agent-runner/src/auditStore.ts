import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Address, Hex } from "viem";
import type { MerchantReceiptAttestation } from "./merchantReceipt.js";

export type SettlementAuditRecord = {
  paymentId: Hex;
  asset: "TSLA" | "AMD" | "AMZN";
  token: Address;
  receiptHash: Hex;
  txHash: Hex;
  amount: string;
  merchant: Address;
  service?: string;
  title?: string;
  responseHash?: Hex;
  merchantReceipt?: MerchantReceiptAttestation;
  unlocked: boolean;
  timestamp: number;
};

const records = new Map<Hex, SettlementAuditRecord>();
const storePath = resolve(process.env.AUDIT_STORE_PATH ?? ".osmium/audit-store.json");
let loaded = false;

function loadStore() {
  if (loaded) return;
  loaded = true;
  if (!existsSync(storePath)) return;
  const raw = readFileSync(storePath, "utf8");
  if (!raw.trim()) return;
  const stored = JSON.parse(raw) as SettlementAuditRecord[];
  for (const record of stored) records.set(record.paymentId, record);
}

function persistStore() {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(listSettlementRecords(), null, 2)}\n`);
}

export function recordSettlement(record: Omit<SettlementAuditRecord, "unlocked" | "timestamp">) {
  loadStore();
  const existing = records.get(record.paymentId);
  records.set(record.paymentId, {
    ...record,
    unlocked: existing?.unlocked ?? false,
    timestamp: Date.now()
  });
  persistStore();
}

export function recordUnlock(paymentId: Hex) {
  loadStore();
  const record = records.get(paymentId);
  if (!record) return undefined;
  const unlocked = { ...record, unlocked: true, timestamp: Date.now() };
  records.set(paymentId, unlocked);
  persistStore();
  return unlocked;
}

export function recordMerchantReceipt(paymentId: Hex, merchantReceipt: MerchantReceiptAttestation) {
  loadStore();
  const record = records.get(paymentId);
  if (!record) return undefined;
  const signed = { ...record, merchantReceipt, timestamp: Date.now() };
  records.set(paymentId, signed);
  persistStore();
  return signed;
}

export function getSettlementRecord(paymentId: Hex) {
  loadStore();
  return records.get(paymentId);
}

export function listSettlementRecords() {
  loadStore();
  return [...records.values()].sort((left, right) => right.timestamp - left.timestamp);
}
