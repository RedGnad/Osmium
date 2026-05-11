import { createPublicClient, createWalletClient, http, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { RunnerConfig } from "./config.js";

export function robinhoodTestnet(config: RunnerConfig): Chain {
  return {
    id: config.chainId,
    name: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [config.rpcUrl] }
    },
    blockExplorers: {
      default: {
        name: "Robinhood Explorer",
        url: "https://explorer.testnet.chain.robinhood.com"
      }
    },
    testnet: true
  };
}

export function publicClient(config: RunnerConfig) {
  return createPublicClient({
    chain: robinhoodTestnet(config),
    transport: http(config.rpcUrl)
  });
}

export function walletClient(config: RunnerConfig, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: robinhoodTestnet(config),
    transport: http(config.rpcUrl)
  });
}

