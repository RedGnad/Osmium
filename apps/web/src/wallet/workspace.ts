/*
 * Self-serve workspace state.
 *
 * The "workspace" is what the user provisions onchain: a policy keyed to
 * their wallet, an approved intent on that policy, and a funded vault on
 * the SettlementRouter. We persist its identifiers in localStorage so a
 * returning operator skips straight to settling.
 */
import {
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  DEFAULTS,
  POLICY_ENGINE_ADDRESS,
  SETTLEMENT_ROUTER_ADDRESS,
  TSLA_ADDRESS,
  erc20Abi,
  policyEngineAbi,
  settlementRouterAbi,
} from "./contracts";

export type Workspace = {
  /* version of the workspace schema — bumped if we change layout */
  version: 1;
  /* the user wallet that owns the policy */
  owner: Address;
  /* agent address registered for this policy. Defaults to owner; only the
     agent can call settleWithIntent. */
  agent: Address;
  policyId: string;
  token: Address;
  intentHash: Hex;
  contextHash: Hex;
  intentValidUntil: number;
  policyValidUntil: number;
  /* tx hashes of the provisioning steps — kept for the audit drawer */
  createPolicyTx?: Hex;
  approveIntentTx?: Hex;
  approveTokenTx?: Hex;
  depositTx?: Hex;
  createdAt: number;
};

const STORAGE_PREFIX = "osmium.workspace.";

function key(owner: Address) {
  return `${STORAGE_PREFIX}${owner.toLowerCase()}`;
}

export function readWorkspace(owner: Address): Workspace | null {
  try {
    const raw = localStorage.getItem(key(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Workspace;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeWorkspace(workspace: Workspace) {
  try {
    localStorage.setItem(key(workspace.owner), JSON.stringify(workspace));
  } catch {
    /* ignore */
  }
}

export function clearWorkspace(owner: Address) {
  try {
    localStorage.removeItem(key(owner));
  } catch {
    /* ignore */
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Public read helpers — used by the vault panel
   ──────────────────────────────────────────────────────────────────────── */

export async function readVaultBalance(
  publicClient: PublicClient,
  owner: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: SETTLEMENT_ROUTER_ADDRESS,
    abi: settlementRouterAbi,
    functionName: "vaultBalance",
    args: [owner, TSLA_ADDRESS],
  })) as bigint;
}

export async function readTokenBalance(
  publicClient: PublicClient,
  owner: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: TSLA_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

export async function readTokenAllowance(
  publicClient: PublicClient,
  owner: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: TSLA_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, SETTLEMENT_ROUTER_ADDRESS],
  })) as bigint;
}

/* ──────────────────────────────────────────────────────────────────────────
   Onchain provisioning + spend helpers — used by the wizard + settle path
   ──────────────────────────────────────────────────────────────────────── */

/* viem requires `account` + `chain` to be re-stated on writeContract when the
   transport was created with a custom transport (EIP-1193). We pull them from
   the connected wallet client. */
async function writeFromWallet<TArgs extends readonly unknown[]>(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args: TArgs;
  },
): Promise<Hex> {
  const account = walletClient.account ?? (await walletClient.getAddresses())[0];
  if (!account) throw new Error("Wallet has no account.");
  const txHash = (await walletClient.writeContract({
    address: params.address,
    abi: params.abi as never,
    functionName: params.functionName,
    args: params.args as never,
    account,
    chain: walletClient.chain ?? null,
  } as never)) as Hex;
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export type CreatePolicyResult = {
  txHash: Hex;
  policyId: string;
  validUntil: number;
};

export async function createPolicyOnchain(
  publicClient: PublicClient,
  walletClient: WalletClient,
  owner: Address,
  agent: Address,
): Promise<CreatePolicyResult> {
  const now = Math.floor(Date.now() / 1000);
  const validUntil = now + DEFAULTS.policyValidDays * 86_400;

  const account = walletClient.account ?? owner;
  const txHash = (await walletClient.writeContract({
    address: POLICY_ENGINE_ADDRESS,
    abi: policyEngineAbi,
    functionName: "createPolicy",
    args: [
      agent,
      TSLA_ADDRESS,
      DEFAULTS.maxPerTxWei,
      DEFAULTS.periodLimitWei,
      DEFAULTS.periodSeconds,
      BigInt(validUntil),
    ],
    account,
    chain: walletClient.chain ?? null,
  } as never)) as Hex;

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const events = parseEventLogs({
    abi: policyEngineAbi,
    eventName: "PolicyCreated",
    logs: receipt.logs.filter(
      (l) => l.address.toLowerCase() === POLICY_ENGINE_ADDRESS.toLowerCase(),
    ),
  });
  if (events.length === 0) {
    throw new Error("PolicyCreated event missing from receipt.");
  }
  const policyId = events[0].args.policyId.toString();
  return { txHash, policyId, validUntil };
}

export async function approveIntentOnchain(
  publicClient: PublicClient,
  walletClient: WalletClient,
  args: {
    owner: Address;
    policyId: string;
    intentHash: Hex;
    contextHash: Hex;
    maxAmount: bigint;
    validUntil: number;
  },
): Promise<Hex> {
  return writeFromWallet(walletClient, publicClient, {
    address: POLICY_ENGINE_ADDRESS,
    abi: policyEngineAbi,
    functionName: "approveIntent",
    args: [
      BigInt(args.policyId),
      args.intentHash,
      args.contextHash,
      args.maxAmount,
      BigInt(args.validUntil),
    ],
  });
}

export async function approveTokenSpending(
  publicClient: PublicClient,
  walletClient: WalletClient,
  amount: bigint,
): Promise<Hex> {
  return writeFromWallet(walletClient, publicClient, {
    address: TSLA_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [SETTLEMENT_ROUTER_ADDRESS, amount],
  });
}

export async function depositToVault(
  publicClient: PublicClient,
  walletClient: WalletClient,
  amount: bigint,
): Promise<Hex> {
  return writeFromWallet(walletClient, publicClient, {
    address: SETTLEMENT_ROUTER_ADDRESS,
    abi: settlementRouterAbi,
    functionName: "deposit",
    args: [TSLA_ADDRESS, amount],
  });
}

export async function withdrawFromVault(
  publicClient: PublicClient,
  walletClient: WalletClient,
  amount: bigint,
): Promise<Hex> {
  return writeFromWallet(walletClient, publicClient, {
    address: SETTLEMENT_ROUTER_ADDRESS,
    abi: settlementRouterAbi,
    functionName: "withdraw",
    args: [TSLA_ADDRESS, amount],
  });
}

export async function mintTestTokens(
  publicClient: PublicClient,
  walletClient: WalletClient,
  to: Address,
  amount: bigint,
): Promise<Hex> {
  return writeFromWallet(walletClient, publicClient, {
    address: TSLA_ADDRESS,
    abi: erc20Abi,
    functionName: "mint",
    args: [to, amount],
  });
}

export async function settleWithIntentDirect(
  publicClient: PublicClient,
  walletClient: WalletClient,
  args: {
    policyId: string;
    intentHash: Hex;
    contextHash: Hex;
    merchant: Address;
    token: Address;
    amount: bigint;
    paymentId: Hex;
    receiptHash: Hex;
  },
): Promise<Hex> {
  return writeFromWallet(walletClient, publicClient, {
    address: SETTLEMENT_ROUTER_ADDRESS,
    abi: settlementRouterAbi,
    functionName: "settleWithIntent",
    args: [
      BigInt(args.policyId),
      args.intentHash,
      args.contextHash,
      args.merchant,
      args.token,
      args.amount,
      args.paymentId,
      args.receiptHash,
    ],
  });
}
