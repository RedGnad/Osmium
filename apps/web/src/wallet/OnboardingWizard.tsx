/*
 * Self-serve provisioning wizard.
 *
 *   01 · Create your policy on the Stylus PolicyEngine
 *   02 · Approve the Osmium intent on your policy
 *   03 · Allow the SettlementRouter to pull TSLA
 *   04 · Deposit your initial vault balance
 *
 * Progress persists in localStorage keyed by the connected wallet, so a
 * page reload (or mid-flow disconnect) resumes from the last completed step.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { formatEther, parseEther, type Address, type Hex } from "viem";
import { useWallet } from "./WalletProvider";
import {
  approveIntentOnchain,
  approveTokenSpending,
  createPolicyOnchain,
  depositToVault,
  readTokenAllowance,
  readTokenBalance,
  readWorkspace,
  type Workspace,
  writeWorkspace,
} from "./workspace";
import {
  DEFAULTS,
  POLICY_ENGINE_ADDRESS,
  ROBINHOOD_FAUCET_URL,
  SETTLEMENT_ROUTER_ADDRESS,
  TSLA_ADDRESS,
  robinhoodTestnet,
} from "./contracts";

type HashLookup = {
  intentHash: Hex;
  contextHash: Hex;
  agent: Address;
  policyIdHint?: string;
};

const RUNNER_URL =
  (import.meta.env.VITE_AGENT_RUNNER_URL as string | undefined) ??
  "http://127.0.0.1:10000";

/* Fetch the runner's canonical intent/context hashes via a one-off 402.
   We don't pay — we just want the challenge body. */
async function fetchOsmiumIntentHashes(): Promise<HashLookup | null> {
  try {
    const res = await fetch(`${RUNNER_URL}/merchant/market-data?asset=TSLA`);
    if (res.status !== 402) return null;
    const body = (await res.json()) as {
      accepts?: Array<{
        extra: {
          intentHash: Hex;
          contextHash: Hex;
          agent: Address;
          policyId?: string;
        };
      }>;
    };
    const extra = body.accepts?.[0]?.extra;
    if (!extra?.intentHash || !extra?.contextHash) return null;
    return {
      intentHash: extra.intentHash,
      contextHash: extra.contextHash,
      agent: extra.agent,
      policyIdHint: extra.policyId,
    };
  } catch {
    return null;
  }
}

type StepStatus = "pending" | "active" | "running" | "done" | "error";

type StepState = {
  status: StepStatus;
  txHash?: Hex;
  error?: string;
};

const EXPLORER = robinhoodTestnet.blockExplorers.default.url;

export function OnboardingWizard({
  onComplete,
}: {
  onComplete?: (workspace: Workspace) => void;
}) {
  const { state, adapter } = useWallet();
  const connected = state.status === "connected" ? state : null;

  const [hashes, setHashes] = useState<HashLookup | null>(null);
  const [step1, setStep1] = useState<StepState>({ status: "active" });
  const [step2, setStep2] = useState<StepState>({ status: "pending" });
  const [step3, setStep3] = useState<StepState>({ status: "pending" });
  const [step4, setStep4] = useState<StepState>({ status: "pending" });

  const [partial, setPartial] = useState<Partial<Workspace>>({});
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [tokenAllowance, setTokenAllowance] = useState<bigint>(0n);
  const [depositInput, setDepositInput] = useState<string>(
    formatEther(DEFAULTS.initialDepositWei),
  );

  /* Resume from a previously stored workspace if one already exists for this
     wallet. If the workspace looks complete we exit immediately. */
  useEffect(() => {
    if (!connected) return;
    const existing = readWorkspace(connected.account);
    if (existing) {
      onComplete?.(existing);
    }
  }, [connected, onComplete]);

  useEffect(() => {
    void fetchOsmiumIntentHashes().then((h) => setHashes(h));
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!connected) return;
    try {
      const [bal, allow] = await Promise.all([
        readTokenBalance(adapter.publicClient, connected.account),
        readTokenAllowance(adapter.publicClient, connected.account),
      ]);
      setTokenBalance(bal);
      setTokenAllowance(allow);
    } catch {
      /* RPC blip — UI just shows last value */
    }
  }, [adapter, connected]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances, step1.status, step3.status, step4.status]);

  function setStep(
    n: 1 | 2 | 3 | 4,
    next: StepState,
  ) {
    if (n === 1) setStep1(next);
    if (n === 2) setStep2(next);
    if (n === 3) setStep3(next);
    if (n === 4) setStep4(next);
  }

  function unlockNext(after: 1 | 2 | 3 | 4) {
    if (after === 1) setStep2({ status: "active" });
    if (after === 2) setStep3({ status: "active" });
    if (after === 3) setStep4({ status: "active" });
  }

  /* Step 01 — createPolicy */
  async function runStep1() {
    if (!connected) return;
    if (connected.onWrongChain) {
      setStep(1, {
        status: "error",
        error: "Wrong network. Switch to Robinhood Chain Testnet first.",
      });
      return;
    }
    if (!adapter.walletClient) return;
    setStep(1, { status: "running" });
    try {
      const { txHash, policyId, validUntil } = await createPolicyOnchain(
        adapter.publicClient,
        adapter.walletClient,
        connected.account,
        connected.account,
      );
      setPartial((p) => ({
        ...p,
        version: 1,
        owner: connected.account,
        agent: connected.account,
        policyId,
        token: TSLA_ADDRESS,
        policyValidUntil: validUntil,
        createPolicyTx: txHash,
        createdAt: Date.now(),
      }));
      setStep(1, { status: "done", txHash });
      unlockNext(1);
    } catch (err) {
      setStep(1, {
        status: "error",
        error: err instanceof Error ? err.message : "createPolicy failed",
      });
    }
  }

  /* Step 02 — approveIntent on the user's own policy */
  async function runStep2() {
    if (!connected || !adapter.walletClient) return;
    if (!partial.policyId || !hashes) {
      setStep(2, {
        status: "error",
        error: "Runner intent hashes are not loaded yet — retry in a second.",
      });
      return;
    }
    setStep(2, { status: "running" });
    try {
      const intentValidUntil =
        Math.min(
          Math.floor(Date.now() / 1000) + DEFAULTS.intentValidDays * 86_400,
          partial.policyValidUntil ?? Number.MAX_SAFE_INTEGER,
        );
      const txHash = await approveIntentOnchain(
        adapter.publicClient,
        adapter.walletClient,
        {
          owner: connected.account,
          policyId: partial.policyId,
          intentHash: hashes.intentHash,
          contextHash: hashes.contextHash,
          maxAmount: DEFAULTS.maxPerTxWei,
          validUntil: intentValidUntil,
        },
      );
      setPartial((p) => ({
        ...p,
        intentHash: hashes.intentHash,
        contextHash: hashes.contextHash,
        intentValidUntil,
        approveIntentTx: txHash,
      }));
      setStep(2, { status: "done", txHash });
      unlockNext(2);
    } catch (err) {
      setStep(2, {
        status: "error",
        error: err instanceof Error ? err.message : "approveIntent failed",
      });
    }
  }

  /* Step 03 — approve token spending */
  async function runStep3() {
    if (!connected || !adapter.walletClient) return;
    setStep(3, { status: "running" });
    try {
      const allowance = DEFAULTS.periodLimitWei * 10n; /* generous */
      const txHash = await approveTokenSpending(
        adapter.publicClient,
        adapter.walletClient,
        allowance,
      );
      setPartial((p) => ({ ...p, approveTokenTx: txHash }));
      setStep(3, { status: "done", txHash });
      unlockNext(3);
    } catch (err) {
      setStep(3, {
        status: "error",
        error: err instanceof Error ? err.message : "approve failed",
      });
    }
  }

  /* Step 04 — deposit into the SettlementRouter vault */
  async function runStep4() {
    if (!connected || !adapter.walletClient) return;

    let amount: bigint;
    try {
      amount = parseEther(depositInput.trim() || "0");
    } catch {
      setStep(4, { status: "error", error: "Invalid amount." });
      return;
    }
    if (amount <= 0n) {
      setStep(4, { status: "error", error: "Amount must be > 0." });
      return;
    }
    if (amount > tokenBalance) {
      setStep(4, {
        status: "error",
        error: `Balance too low — you hold ${formatEther(tokenBalance)} TSLA.`,
      });
      return;
    }
    setStep(4, { status: "running" });
    try {
      const txHash = await depositToVault(
        adapter.publicClient,
        adapter.walletClient,
        amount,
      );
      const finalPartial: Workspace = {
        version: 1,
        owner: connected.account,
        agent: connected.account,
        policyId: partial.policyId!,
        token: TSLA_ADDRESS,
        intentHash: partial.intentHash!,
        contextHash: partial.contextHash!,
        intentValidUntil: partial.intentValidUntil!,
        policyValidUntil: partial.policyValidUntil!,
        createPolicyTx: partial.createPolicyTx,
        approveIntentTx: partial.approveIntentTx,
        approveTokenTx: partial.approveTokenTx,
        depositTx: txHash,
        createdAt: partial.createdAt ?? Date.now(),
      };
      writeWorkspace(finalPartial);
      setPartial(finalPartial);
      setStep(4, { status: "done", txHash });
      onComplete?.(finalPartial);
    } catch (err) {
      setStep(4, {
        status: "error",
        error: err instanceof Error ? err.message : "deposit failed",
      });
    }
  }

  /* TSLA is a role-gated Robinhood token — not freely mintable. When the
     connected wallet holds nothing, point the operator at the faucet. */
  const showFaucetHelper =
    connected && tokenBalance === 0n && step4.status !== "done";

  const steps = useMemo(
    () => [
      {
        n: 1 as const,
        title: "Create your policy",
        description:
          "Calls policyEngine.createPolicy(agent=you, token=TSLA, maxPerTx, periodLimit, validUntil). msg.sender becomes the owner of a fresh onchain policy. ~30k gas.",
        state: step1,
        action: runStep1,
        meta: [
          { k: "Engine", v: short(POLICY_ENGINE_ADDRESS) },
          { k: "Max / tx", v: "1.00 TSLA" },
          { k: "Period limit", v: "10.00 TSLA · 24h" },
          { k: "Valid", v: `${DEFAULTS.policyValidDays} days` },
        ],
      },
      {
        n: 2 as const,
        title: "Approve the Osmium intent",
        description:
          "Calls policyEngine.approveIntent(policyId, intentHash, contextHash, max, validUntil) on your policy. Authorizes the canonical Osmium clearance intent so the runner's 402 challenges resolve against your policy.",
        state: step2,
        action: runStep2,
        meta: [
          {
            k: "Intent",
            v: hashes ? short(hashes.intentHash) : "fetching…",
          },
          {
            k: "Context",
            v: hashes ? short(hashes.contextHash) : "fetching…",
          },
          { k: "Max amount", v: "1.00 TSLA" },
          { k: "Valid", v: `${DEFAULTS.intentValidDays} days` },
        ],
      },
      {
        n: 3 as const,
        title: "Allow the SettlementRouter",
        description:
          "Calls TSLA.approve(SettlementRouter, generous allowance). The router pulls TSLA from your wallet on deposit. One-time approval per token.",
        state: step3,
        action: runStep3,
        meta: [
          { k: "Token", v: short(TSLA_ADDRESS) },
          { k: "Spender", v: short(SETTLEMENT_ROUTER_ADDRESS) },
          {
            k: "Current allowance",
            v: `${Number(formatEther(tokenAllowance)).toFixed(2)} TSLA`,
          },
        ],
      },
      {
        n: 4 as const,
        title: "Deposit into your vault",
        description:
          "Calls SettlementRouter.deposit(TSLA, amount). The router credits vaultBalance[you][TSLA]. settleWithIntent later debits from this balance.",
        state: step4,
        action: runStep4,
        meta: [
          {
            k: "Wallet balance",
            v: `${Number(formatEther(tokenBalance)).toFixed(2)} TSLA`,
          },
          {
            k: "Allowance",
            v: `${Number(formatEther(tokenAllowance)).toFixed(2)} TSLA`,
          },
        ],
      },
    ],
    [step1, step2, step3, step4, hashes, tokenAllowance, tokenBalance],
  );

  if (!connected) return null;

  return (
    <section className="wizard" aria-label="Self-serve onboarding">
      <header className="wizardHead">
        <div>
          <span className="wizardEyebrow">Provision your workspace</span>
          <h2>
            Four onchain steps. <em>One per wallet, one time.</em>
          </h2>
          <p>
            Each step is a real Robinhood Chain Testnet transaction signed by
            your wallet. State persists in this browser; on a fresh tab the
            wizard resumes from the last completed step.
          </p>
        </div>
        <div className="wizardChain">
          <span>Owner</span>
          <strong>
            {connected.account.slice(0, 6)}…{connected.account.slice(-4)}
          </strong>
        </div>
      </header>

      {showFaucetHelper ? (
        <div className="wizardHelper">
          <div>
            <strong>You hold 0 TSLA.</strong>
            <span>
              TSLA is a role-gated Robinhood testnet token — not freely
              mintable. Claim 5 TSLA + gas from the official faucet (once
              per 24h), then come back and refresh.
            </span>
          </div>
          <a
            className="btn ghost"
            href={ROBINHOOD_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open Robinhood faucet <ExternalLink size={13} />
          </a>
        </div>
      ) : null}

      <ol className="wizardSteps">
        {steps.map((step) => (
          <li
            className={`wizardStep ${step.state.status}`}
            key={step.n}
          >
            <div className="wizardStepHead">
              <div className="wizardStepN">
                {step.state.status === "done" ? (
                  <Check size={16} strokeWidth={3} />
                ) : (
                  `0${step.n}`
                )}
              </div>
              <div className="wizardStepTitle">
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </div>
              <div className="wizardStepAction">
                {step.state.status === "done" && step.state.txHash ? (
                  <a
                    className="linkOut"
                    href={`${EXPLORER}/tx/${step.state.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={11} /> tx
                  </a>
                ) : step.state.status === "running" ? (
                  <span className="wizardSpinner">Signing…</span>
                ) : step.state.status === "pending" ? (
                  <span className="wizardLocked">locked</span>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void step.action()}
                    disabled={
                      step.state.status === "error" &&
                      step.n === 2 &&
                      !hashes
                    }
                  >
                    {step.state.status === "error" ? "Retry" : "Sign"}{" "}
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>

            {step.n === 4 && step.state.status === "active" ? (
              <div className="wizardAmountRow">
                <label>
                  <span>Deposit amount (TSLA)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={depositInput}
                    onChange={(e) => setDepositInput(e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            <dl className="wizardStepMeta">
              {step.meta.map((m) => (
                <div key={m.k}>
                  <dt>{m.k}</dt>
                  <dd>{m.v}</dd>
                </div>
              ))}
            </dl>

            {step.state.error ? (
              <div className="wizardError">{step.state.error}</div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function short(value: string) {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
