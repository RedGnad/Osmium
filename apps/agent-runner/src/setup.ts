import { maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { osmiumPolicyEngineAbi } from "./abi.js";
import { publicClient, walletClient } from "./client.js";
import { loadConfig } from "./config.js";
import { hashLabel } from "./osmium.js";

async function main() {
  const config = loadConfig();
  if (!config.adminPrivateKey) throw new Error("ADMIN_PRIVATE_KEY is required for setup");
  if (!config.agentAddress) throw new Error("AGENT_ADDRESS is required for setup");

  const admin = walletClient(config, config.adminPrivateKey);
  const reader = publicClient(config);
  const account = privateKeyToAccount(config.adminPrivateKey);

  const adminOnchain = await reader.readContract({
    address: config.engineAddress,
    abi: osmiumPolicyEngineAbi,
    functionName: "admin"
  });

  if (adminOnchain === "0x0000000000000000000000000000000000000000") {
    const hash = await admin.writeContract({
      address: config.engineAddress,
      abi: osmiumPolicyEngineAbi,
      functionName: "init"
    });
    await reader.waitForTransactionReceipt({ hash });
    console.log(`init: ${hash}`);
  }

  const merchantHash = await admin.writeContract({
    address: config.engineAddress,
    abi: osmiumPolicyEngineAbi,
    functionName: "registerMerchant",
    args: [config.merchantAddress, hashLabel("api-data"), hashLabel("osmium-demo-merchant")]
  });
  await reader.waitForTransactionReceipt({ hash: merchantHash });
  console.log(`registerMerchant: ${merchantHash}`);

  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
  const policyHash = await admin.writeContract({
    address: config.engineAddress,
    abi: osmiumPolicyEngineAbi,
    functionName: "createPolicy",
    args: [
      config.agentAddress,
      config.tokenAddress,
      config.maxPerTxWei,
      config.periodLimitWei,
      24n * 60n * 60n,
      validUntil
    ]
  });
  await reader.waitForTransactionReceipt({ hash: policyHash });
  console.log(`createPolicy owner=${account.address}: ${policyHash}`);
  console.log(`Use POLICY_ID from nextPolicyId logs or call nextPolicyId and subtract 1.`);

  // Keeps maxUint256 imported intentionally visible for future settlement adapter setup.
  void maxUint256;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

