import { recoverTypedDataAddress } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { RunnerConfig } from "./config.js";

const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export type MerchantReceiptMessage = {
  merchant: Address;
  agent: Address;
  policyId: string;
  asset: Address;
  amount: string;
  resourceId: Hex;
  responseHash: Hex;
  paymentId: Hex;
  chainId: string;
  settlementTxHash: Hex;
  expiresAt: string;
};

export type MerchantReceiptAttestation = {
  standard: "EIP-712";
  primaryType: "MerchantReceipt";
  domain: {
    name: "Osmium Merchant Receipt";
    version: "1";
    chainId: number;
    verifyingContract: Address;
  };
  types: typeof merchantReceiptTypes;
  message: MerchantReceiptMessage;
  signer: Address | null;
  expectedSigner: Address | null;
  recoveredSigner: Address | null;
  signature: Hex | null;
  verified: boolean;
  mode: "signed" | "unsigned-demo";
  note: string;
};

const merchantReceiptTypes = {
  MerchantReceipt: [
    { name: "merchant", type: "address" },
    { name: "agent", type: "address" },
    { name: "policyId", type: "uint256" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "resourceId", type: "bytes32" },
    { name: "responseHash", type: "bytes32" },
    { name: "paymentId", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "settlementTxHash", type: "bytes32" },
    { name: "expiresAt", type: "uint256" }
  ]
} as const;

function validBytes32(value: Hex | undefined) {
  return value && /^0x[a-fA-F0-9]{64}$/.test(value) ? value : zeroHash;
}

export async function buildMerchantReceiptAttestation(
  config: RunnerConfig,
  input: {
    merchant: Address;
    asset: Address;
    amount: string;
    resourceId: Hex;
    responseHash: Hex;
    paymentId: Hex;
    settlementTxHash?: Hex;
  }
): Promise<MerchantReceiptAttestation> {
  const domain = {
    name: "Osmium Merchant Receipt",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.settlementRouterAddress ?? config.engineAddress
  } as const;
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  const message = {
    merchant: input.merchant,
    agent: config.agentAddress ?? zeroAddress,
    policyId: config.settlementDemoPolicyId.toString(),
    asset: input.asset,
    amount: input.amount,
    resourceId: input.resourceId,
    responseHash: input.responseHash,
    paymentId: input.paymentId,
    chainId: config.chainId.toString(),
    settlementTxHash: validBytes32(input.settlementTxHash),
    expiresAt: expiresAt.toString()
  };

  if (!config.merchantReceiptSignerPrivateKey) {
    return {
      standard: "EIP-712",
      primaryType: "MerchantReceipt",
      domain,
      types: merchantReceiptTypes,
      message,
      signer: null,
      expectedSigner: null,
      recoveredSigner: null,
      signature: null,
      verified: false,
      mode: "unsigned-demo",
      note: "Set MERCHANT_RECEIPT_SIGNER_PRIVATE_KEY on the runner to return a merchant-signed receipt."
    };
  }

  const signer = privateKeyToAccount(config.merchantReceiptSignerPrivateKey);
  const typedMessage = {
    ...message,
    policyId: BigInt(message.policyId),
    amount: BigInt(message.amount),
    chainId: BigInt(message.chainId),
    expiresAt: BigInt(message.expiresAt)
  };
  const signature = await signer.signTypedData({
    domain,
    primaryType: "MerchantReceipt",
    types: merchantReceiptTypes,
    message: typedMessage
  });
  const recoveredSigner = await recoverTypedDataAddress({
    domain,
    primaryType: "MerchantReceipt",
    types: merchantReceiptTypes,
    message: typedMessage,
    signature
  });
  const verified = recoveredSigner.toLowerCase() === signer.address.toLowerCase();

  return {
    standard: "EIP-712",
    primaryType: "MerchantReceipt",
    domain,
    types: merchantReceiptTypes,
    message,
    signer: signer.address,
    expectedSigner: signer.address,
    recoveredSigner,
    signature,
    verified,
    mode: "signed",
    note: verified
      ? "Merchant service receipt signature recovered to the expected service signer."
      : "Merchant service receipt signature did not recover to the expected service signer."
  };
}
