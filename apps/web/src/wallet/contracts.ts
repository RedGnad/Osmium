/*
 * Frontend ABIs and contract addresses for Osmium self-serve.
 * Kept narrow on purpose — only the functions called from the browser.
 */
import type { Address } from "viem";

export const RH_CHAIN_ID = Number(
  (import.meta.env.VITE_CHAIN_ID as string | undefined) ?? "46630",
);

export const RH_RPC_URL =
  (import.meta.env.VITE_RH_RPC_URL as string | undefined) ??
  "https://rpc.testnet.chain.robinhood.com";

export const POLICY_ENGINE_ADDRESS = ((import.meta.env
  .VITE_OSMIUM_POLICY_ENGINE_ADDRESS as string | undefined) ??
  "0x5e30622c7639aa5edc43313830c9a01341585728") as Address;

export const SETTLEMENT_ROUTER_ADDRESS = ((import.meta.env
  .VITE_OSMIUM_SETTLEMENT_ROUTER_ADDRESS as string | undefined) ??
  "0x1CD04cbD3348D5fa28B30776902464752e878ac7") as Address;

export const TSLA_ADDRESS = ((import.meta.env
  .VITE_TSLA_TOKEN_ADDRESS as string | undefined) ??
  "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E") as Address;

/* ────────────────────────────────────────────────────────────────────────
   ABIs — narrow subsets only
   ──────────────────────────────────────────────────────────────────────── */

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/* TSLA on Robinhood Chain testnet is a role-gated token — it is NOT freely
   mintable. Test balances come from the official faucet (5 of each stock
   token + ETH, once per 24h per address). */
export const ROBINHOOD_FAUCET_URL =
  "https://faucet.testnet.chain.robinhood.com";

export const settlementRouterAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleWithIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyId", type: "uint256" },
      { name: "intentHash", type: "bytes32" },
      { name: "contextHash", type: "bytes32" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "paymentId", type: "bytes32" },
      { name: "receiptHash", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "vaultBalance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const policyEngineAbi = [
  {
    type: "function",
    name: "createPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "token", type: "address" },
      { name: "max_per_tx", type: "uint256" },
      { name: "period_limit", type: "uint256" },
      { name: "period_seconds", type: "uint64" },
      { name: "valid_until", type: "uint64" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approveIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policy_id", type: "uint256" },
      { name: "intent_hash", type: "bytes32" },
      { name: "context_hash", type: "bytes32" },
      { name: "max_amount", type: "uint256" },
      { name: "valid_until", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getPolicy",
    stateMutability: "view",
    inputs: [{ name: "policy_id", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "agent", type: "address" },
      { name: "token", type: "address" },
      { name: "max_per_tx", type: "uint256" },
      { name: "period_limit", type: "uint256" },
      { name: "period_seconds", type: "uint64" },
      { name: "valid_until", type: "uint64" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "PolicyCreated",
    inputs: [
      { name: "policyId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "max_per_tx", type: "uint256", indexed: false },
      { name: "period_limit", type: "uint256", indexed: false },
      { name: "period_seconds", type: "uint64", indexed: false },
      { name: "valid_until", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "IntentApproved",
    inputs: [
      { name: "policyId", type: "uint256", indexed: true },
      { name: "intentHash", type: "bytes32", indexed: true },
      { name: "contextHash", type: "bytes32", indexed: false },
      { name: "maxAmount", type: "uint256", indexed: false },
      { name: "validUntil", type: "uint64", indexed: false },
    ],
  },
] as const;

/* Sane defaults for first-time self-serve provisioning on testnet.
   maxPerTx 1 TSLA, period 10 TSLA over 24h, policy good for 90 days,
   intent good for 30 days. The wizard makes these visible & editable later. */
export const DEFAULTS = {
  maxPerTxWei: 1_000_000_000_000_000_000n,
  periodLimitWei: 10_000_000_000_000_000_000n,
  periodSeconds: 86_400n,
  policyValidDays: 90,
  intentValidDays: 30,
  /* default deposit on first run — user can change. 1 TSLA. */
  initialDepositWei: 1_000_000_000_000_000_000n,
} as const;

/* Canonical Robinhood Chain Testnet definition consumed by viem clients. */
export const robinhoodTestnet = {
  id: RH_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RH_RPC_URL] },
    public: { http: [RH_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
} as const;
