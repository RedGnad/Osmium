import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi, settlementRouterAbi } from "./settlementAbi.js";
import { blockReasons, osmiumPolicyEngineAbi } from "./abi.js";
import { publicClient, walletClient } from "./client.js";
import { loadConfig } from "./config.js";
import { hashLabel } from "./osmium.js";
import { recordSettlement } from "./auditStore.js";

export const LIVE_SETTLEMENT_CONTEXT_HASH = hashLabel("task:osmium-demo-agent-payment");

type LiveSettlementOptions = {
  amount?: bigint;
  paymentId?: `0x${string}`;
  receiptHash?: `0x${string}`;
};

function stringify(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringify);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringify(item)]));
  }
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readLiveSettlementProof() {
  const config = loadConfig();
  if (!config.settlementRouterAddress) throw new Error("OSMIUM_SETTLEMENT_ROUTER_ADDRESS is required");
  if (!config.agentAddress) throw new Error("AGENT_ADDRESS is required");

  const client = publicClient(config);
  const token = config.settlementDemoTokenAddress;
  const amount = BigInt(process.env.SETTLEMENT_DEMO_AMOUNT_WEI ?? "250000000000000000");
  const paymentId = config.latestSettlementPaymentId ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
  const receiptHash = config.latestSettlementReceiptHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
  const [replayAllowed, replayReason] =
    paymentId === "0x0000000000000000000000000000000000000000000000000000000000000000"
      ? [true, 0]
      : await client.readContract({
          address: config.engineAddress,
          abi: osmiumPolicyEngineAbi,
          functionName: "previewAuthorizationWithIntent",
          args: [
            config.settlementDemoPolicyId,
            config.demoIntentHash,
            LIVE_SETTLEMENT_CONTEXT_HASH,
            config.agentAddress,
            config.merchantAddress,
            token,
            amount,
            paymentId,
            receiptHash
          ]
        });

  return stringify({
    policyId: config.settlementDemoPolicyId,
    token,
    amount,
    intentHash: config.demoIntentHash,
    contextHash: LIVE_SETTLEMENT_CONTEXT_HASH,
    paymentId,
    receiptHash,
    before: {
      merchantToken: await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [config.merchantAddress]
      }),
      routerVault: await client.readContract({
        address: config.settlementRouterAddress,
        abi: settlementRouterAbi,
        functionName: "vaultBalance",
        args: [config.agentAddress, token]
      })
    },
    transactions: {
      settle: config.latestSettlementTx ?? "",
      settleBlock: ""
    },
    replay: {
      blocked: !replayAllowed,
      reason: replayReason,
      reasonName: blockReasons[replayReason] ?? `Unknown(${replayReason})`
    },
    after: {
      merchantToken: await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [config.merchantAddress]
      }),
      routerVault: await client.readContract({
        address: config.settlementRouterAddress,
        abi: settlementRouterAbi,
        functionName: "vaultBalance",
        args: [config.agentAddress, token]
      }),
      receipt:
        paymentId === "0x0000000000000000000000000000000000000000000000000000000000000000"
          ? []
          : await client.readContract({
              address: config.engineAddress,
              abi: osmiumPolicyEngineAbi,
              functionName: "getReceipt",
              args: [paymentId]
            })
    }
  });
}

export async function runLiveSettlement(options: LiveSettlementOptions = {}) {
  const config = loadConfig();
  if (!config.agentPrivateKey) throw new Error("AGENT_PRIVATE_KEY is required");
  if (!config.settlementRouterAddress) throw new Error("OSMIUM_SETTLEMENT_ROUTER_ADDRESS is required");
  if (!config.agentAddress) throw new Error("AGENT_ADDRESS is required");

  const client = publicClient(config);
  const wallet = walletClient(config, config.agentPrivateKey);
  const account = privateKeyToAccount(config.agentPrivateKey);
  const token = config.settlementDemoTokenAddress;
  const amount = options.amount ?? BigInt(process.env.SETTLEMENT_DEMO_AMOUNT_WEI ?? "250000000000000000");
  const runId = Date.now();
  const paymentId = options.paymentId ?? hashLabel(`osmium-live-settlement:${runId}`);
  const receiptHash = options.receiptHash ?? hashLabel(`receipt-live-settlement:${runId}`);

  const before = {
    ownerToken: await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    merchantToken: await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [config.merchantAddress]
    }),
    routerVault: await client.readContract({
      address: config.settlementRouterAddress,
      abi: settlementRouterAbi,
      functionName: "vaultBalance",
      args: [account.address, token]
    })
  };

  let approveTx: `0x${string}` | "" = "";
  let depositTx: `0x${string}` | "" = "";
  const vaultTopUp = before.routerVault >= amount ? 0n : amount - before.routerVault;
  if (vaultTopUp > 0n) {
    if (before.ownerToken < vaultTopUp) {
      const need = (Number(vaultTopUp) / 1e18).toFixed(2);
      const have = (Number(before.ownerToken) / 1e18).toFixed(2);
      throw new Error(
        `Demo TSLA vault depleted. The demo agent wallet ${account.address} ` +
          `holds ${have} TSLA but needs ${need} to settle. Top it up from the ` +
          `Robinhood Chain faucet at faucet.testnet.chain.robinhood.com ` +
          `(enter the agent address, claim 5 TSLA), then retry. ` +
          `Self-serve operators are unaffected — they fund their own vault.`
      );
    }

    approveTx = await wallet.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [config.settlementRouterAddress, vaultTopUp],
      account,
      chain: undefined
    });
    await client.waitForTransactionReceipt({ hash: approveTx });

    depositTx = await wallet.writeContract({
      address: config.settlementRouterAddress,
      abi: settlementRouterAbi,
      functionName: "deposit",
      args: [token, vaultTopUp],
      account,
      chain: undefined
    });
    await client.waitForTransactionReceipt({ hash: depositTx });
  }

  const settlementArgs = [
    config.settlementDemoPolicyId,
    config.demoIntentHash,
    LIVE_SETTLEMENT_CONTEXT_HASH,
    config.merchantAddress,
    token,
    amount,
    paymentId,
    receiptHash
  ] as const;

  const settleTx = await wallet.writeContract({
    address: config.settlementRouterAddress,
    abi: settlementRouterAbi,
    functionName: "settleWithIntent",
    args: settlementArgs,
    account,
    chain: undefined
  });
  const settleReceipt = await client.waitForTransactionReceipt({ hash: settleTx });

  let replayAllowed = true;
  let replayReason = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    [replayAllowed, replayReason] = await client.readContract({
      address: config.engineAddress,
      abi: osmiumPolicyEngineAbi,
      functionName: "previewAuthorizationWithIntent",
      args: [
        config.settlementDemoPolicyId,
        config.demoIntentHash,
        LIVE_SETTLEMENT_CONTEXT_HASH,
        account.address,
        config.merchantAddress,
        token,
        amount,
        paymentId,
        receiptHash
      ]
    });
    if (!replayAllowed && replayReason === 8) break;
    await sleep(1000);
  }

  const after = {
    ownerToken: await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    merchantToken: await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [config.merchantAddress]
    }),
    routerVault: await client.readContract({
      address: config.settlementRouterAddress,
      abi: settlementRouterAbi,
      functionName: "vaultBalance",
      args: [account.address, token]
    }),
    receipt: await client.readContract({
      address: config.engineAddress,
      abi: osmiumPolicyEngineAbi,
      functionName: "getReceipt",
      args: [paymentId]
    })
  };

  process.env.LATEST_SETTLEMENT_TX = settleTx;
  process.env.LATEST_SETTLEMENT_PAYMENT_ID = paymentId;
  process.env.LATEST_SETTLEMENT_RECEIPT_HASH = receiptHash;
  await recordSettlement({
    paymentId,
    asset: "TSLA",
    token,
    receiptHash,
    txHash: settleTx,
    amount: amount.toString(),
    merchant: config.merchantAddress
  });

  return stringify({
    policyId: config.settlementDemoPolicyId,
    token,
    amount,
    intentHash: config.demoIntentHash,
    contextHash: LIVE_SETTLEMENT_CONTEXT_HASH,
    scheme: options.paymentId ? "osmium-x402-delegated-vault" : "osmium-live-settlement",
    paymentId,
    receiptHash,
    before,
    transactions: {
      approve: approveTx,
      deposit: depositTx,
      settle: settleTx,
      settleBlock: settleReceipt.blockNumber
    },
    replay: {
      blocked: !replayAllowed,
      reason: replayReason,
      reasonName: blockReasons[replayReason] ?? `Unknown(${replayReason})`
    },
    after
  });
}

async function main() {
  console.log(JSON.stringify(await runLiveSettlement(), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
