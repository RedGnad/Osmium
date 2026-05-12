import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { keccak256, toBytes } from "viem";
import type { Address, Hex } from "viem";

function loadNearestEnv(startDir = process.cwd()) {
  let current = startDir;
  while (true) {
    const candidate = resolve(current, ".env");
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }

    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

loadNearestEnv();

export type RunnerConfig = {
  rpcUrl: string;
  chainId: number;
  engineAddress: Address;
  adminPrivateKey?: Hex;
  agentPrivateKey?: Hex;
  agentAddress?: Address;
  policyId: bigint;
  demoIntentHash: Hex;
  tokenAddress: Address;
  merchantAddress: Address;
  unknownMerchantAddress: Address;
  maxPerTxWei: bigint;
  periodLimitWei: bigint;
  runnerApiKey?: string;
  requireRunnerApiKey: boolean;
  port: number;
};

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function optionalHex(name: string): Hex | undefined {
  const value = process.env[name];
  if (!value || value === "0x") return undefined;
  if (!value.startsWith("0x")) return `0x${value}` as Hex;
  return value as Hex;
}

export function loadConfig(): RunnerConfig {
  const adminPrivateKey = optionalHex("ADMIN_PRIVATE_KEY") ?? optionalHex("PRIVATE_KEY") ?? optionalHex("AGENT_PRIVATE_KEY");

  return {
    rpcUrl: env("RH_RPC_URL", "https://rpc.testnet.chain.robinhood.com"),
    chainId: Number(env("CHAIN_ID", "46630")),
    engineAddress: env("OSMIUM_POLICY_ENGINE_ADDRESS") as Address,
    adminPrivateKey,
    agentPrivateKey: optionalHex("AGENT_PRIVATE_KEY"),
    agentAddress: process.env.AGENT_ADDRESS as Address | undefined,
    policyId: BigInt(env("POLICY_ID", "1")),
    demoIntentHash:
      (process.env.DEMO_INTENT_HASH && process.env.DEMO_INTENT_HASH !== "0x0000000000000000000000000000000000000000000000000000000000000000"
        ? process.env.DEMO_INTENT_HASH
        : keccak256(toBytes("osmium-demo-intent"))) as Hex,
    tokenAddress: env("TOKEN_ADDRESS") as Address,
    merchantAddress: env("MERCHANT_ADDRESS") as Address,
    unknownMerchantAddress: env("UNKNOWN_MERCHANT_ADDRESS", env("MERCHANT_ADDRESS")) as Address,
    maxPerTxWei: BigInt(env("MAX_PER_TX_WEI", "1000000000000000000")),
    periodLimitWei: BigInt(env("PERIOD_LIMIT_WEI", "3000000000000000000")),
    runnerApiKey: process.env.RUNNER_API_KEY,
    requireRunnerApiKey: process.env.RUNNER_REQUIRE_API_KEY === "true" || process.env.RENDER === "true",
    port: Number(env("PORT", "10000"))
  };
}
