import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
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
  /* Address that signed settleWithIntent. Demo lane -> config.agentAddress.
     Self-serve lane -> the connected wallet that called the contract. */
  payer?: Address;
  /* Onchain policy that authorised the payment. Helps filter "my workspace". */
  policyId?: string;
  /* Tracks which Osmium lane recorded this row. */
  lane?: "demo" | "self-serve";
};

const records = new Map<Hex, SettlementAuditRecord>();
const defaultStorePath =
  process.env.VERCEL === "1"
    ? "/tmp/osmium-audit-store.json"
    : ".osmium/audit-store.json";
const storePath = resolve(process.env.AUDIT_STORE_PATH ?? defaultStorePath);
let loaded = false;
let schemaReady = false;
type TursoClient = ReturnType<typeof createClient>;

let tursoClient: TursoClient | null | undefined;

function getTursoClient() {
  if (tursoClient !== undefined) return tursoClient;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  tursoClient =
    url && authToken
      ? createClient({
          url,
          authToken,
        })
      : null;
  return tursoClient;
}

async function ensureTursoSchema(client: TursoClient) {
  if (schemaReady) return;
  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      lane TEXT NOT NULL,
      event TEXT NOT NULL,
      decision TEXT,
      asset TEXT,
      amount TEXT,
      payer TEXT,
      agent TEXT,
      merchant TEXT,
      policy_id TEXT,
      payment_id TEXT,
      receipt_hash TEXT,
      tx_hash TEXT,
      reason TEXT,
      raw_json TEXT
    )
  `);
  schemaReady = true;
}

async function loadStore() {
  const client = getTursoClient();
  if (client) {
    /* Vercel serves requests from many short-lived, independently-reused
       function instances. Caching "loaded" across requests means a reused
       instance never sees rows another instance wrote — a freshly-settled
       payment then reads back as "still locked" on the unlock step. Always
       re-read from Turso so every instance has the authoritative ledger. */
    await ensureTursoSchema(client);
    const result = await client.execute(
      "SELECT raw_json FROM audit_events ORDER BY created_at DESC",
    );
    for (const row of result.rows) {
      const raw = row.raw_json;
      if (typeof raw !== "string" || !raw.trim()) continue;
      const record = JSON.parse(raw) as SettlementAuditRecord;
      records.set(record.paymentId, record);
    }
    return;
  }

  /* File-backed store (local dev) is single-process, so caching is safe. */
  if (loaded) return;
  loaded = true;

  if (!existsSync(storePath)) return;
  const raw = readFileSync(storePath, "utf8");
  if (!raw.trim()) return;
  const stored = JSON.parse(raw) as SettlementAuditRecord[];
  for (const record of stored) records.set(record.paymentId, record);
}

function sortedRecords() {
  return [...records.values()].sort(
    (left, right) => right.timestamp - left.timestamp,
  );
}

async function persistStore() {
  const client = getTursoClient();
  if (client) {
    await ensureTursoSchema(client);
    for (const record of sortedRecords()) {
      await client.execute({
        sql: `
          INSERT INTO audit_events (
            id, created_at, lane, event, decision, asset, amount, payer, agent,
            merchant, policy_id, payment_id, receipt_hash, tx_hash, reason, raw_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            created_at = excluded.created_at,
            lane = excluded.lane,
            event = excluded.event,
            decision = excluded.decision,
            asset = excluded.asset,
            amount = excluded.amount,
            payer = excluded.payer,
            agent = excluded.agent,
            merchant = excluded.merchant,
            policy_id = excluded.policy_id,
            payment_id = excluded.payment_id,
            receipt_hash = excluded.receipt_hash,
            tx_hash = excluded.tx_hash,
            reason = excluded.reason,
            raw_json = excluded.raw_json
        `,
        args: [
          record.paymentId,
          new Date(record.timestamp).toISOString(),
          record.lane ?? "demo",
          record.unlocked ? "DATA_UNLOCKED" : "SETTLEMENT_EXECUTED",
          record.unlocked ? "unlocked" : "settled",
          record.asset,
          record.amount,
          record.payer ?? null,
          record.payer ?? null,
          record.merchant,
          record.policyId ?? null,
          record.paymentId,
          record.receiptHash,
          record.txHash,
          null,
          JSON.stringify(record),
        ],
      });
    }
    return;
  }

  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(sortedRecords(), null, 2)}\n`);
}

export async function recordSettlement(
  record: Omit<SettlementAuditRecord, "unlocked" | "timestamp">,
) {
  await loadStore();
  const existing = records.get(record.paymentId);
  records.set(record.paymentId, {
    ...record,
    unlocked: existing?.unlocked ?? false,
    timestamp: Date.now(),
  });
  await persistStore();
}

export async function recordUnlock(paymentId: Hex) {
  await loadStore();
  const record = records.get(paymentId);
  if (!record) return undefined;
  const unlocked = { ...record, unlocked: true, timestamp: Date.now() };
  records.set(paymentId, unlocked);
  await persistStore();
  return unlocked;
}

export async function recordMerchantReceipt(
  paymentId: Hex,
  merchantReceipt: MerchantReceiptAttestation,
) {
  await loadStore();
  const record = records.get(paymentId);
  if (!record) return undefined;
  const signed = { ...record, merchantReceipt, timestamp: Date.now() };
  records.set(paymentId, signed);
  await persistStore();
  return signed;
}

export async function getSettlementRecord(paymentId: Hex) {
  await loadStore();
  return records.get(paymentId);
}

export async function listSettlementRecords() {
  await loadStore();
  return sortedRecords();
}
