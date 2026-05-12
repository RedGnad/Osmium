import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi, settlementRouterAbi } from "./settlementAbi.js";
import { blockReasons, osmiumPolicyEngineAbi } from "./abi.js";
import { publicClient, walletClient } from "./client.js";
import { loadConfig } from "./config.js";
import { hashLabel } from "./osmium.js";

const CONTEXT_HASH = hashLabel("task:osmium-demo-agent-payment");

function stringify(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringify);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringify(item)]));
  }
  return value;
}

async function main() {
  const config = loadConfig();
  if (!config.agentPrivateKey) throw new Error("AGENT_PRIVATE_KEY is required");
  if (!config.settlementRouterAddress) throw new Error("OSMIUM_SETTLEMENT_ROUTER_ADDRESS is required");
  if (!config.agentAddress) throw new Error("AGENT_ADDRESS is required");

  const client = publicClient(config);
  const wallet = walletClient(config, config.agentPrivateKey);
  const account = privateKeyToAccount(config.agentPrivateKey);
  const token = config.settlementDemoTokenAddress;
  const amount = BigInt(process.env.SETTLEMENT_DEMO_AMOUNT_WEI ?? "250000000000000000");
  const depositAmount = BigInt(process.env.SETTLEMENT_DEMO_DEPOSIT_WEI ?? (amount * 2n).toString());
  const runId = Date.now();
  const paymentId = hashLabel(`osmium-live-settlement:${runId}`);
  const receiptHash = hashLabel(`receipt-live-settlement:${runId}`);

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

  const approveTx = await wallet.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [config.settlementRouterAddress, depositAmount]
  });
  await client.waitForTransactionReceipt({ hash: approveTx });

  const depositTx = await wallet.writeContract({
    address: config.settlementRouterAddress,
    abi: settlementRouterAbi,
    functionName: "deposit",
    args: [token, depositAmount]
  });
  await client.waitForTransactionReceipt({ hash: depositTx });

  const settlementArgs = [
    config.settlementDemoPolicyId,
    config.demoIntentHash,
    CONTEXT_HASH,
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
    args: settlementArgs
  });
  const settleReceipt = await client.waitForTransactionReceipt({ hash: settleTx });

  const [replayAllowed, replayReason] = await client.readContract({
    address: config.engineAddress,
    abi: osmiumPolicyEngineAbi,
    functionName: "previewAuthorizationWithIntent",
    args: [
      config.settlementDemoPolicyId,
      config.demoIntentHash,
      CONTEXT_HASH,
      account.address,
      config.merchantAddress,
      token,
      amount,
      paymentId,
      receiptHash
    ]
  });

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

  console.log(
    JSON.stringify(
      stringify({
        policyId: config.settlementDemoPolicyId,
        token,
        amount,
        intentHash: config.demoIntentHash,
        contextHash: CONTEXT_HASH,
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
      }),
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
