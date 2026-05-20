import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, RefreshCw } from "lucide-react";
import { formatEther, parseEther, type Hex } from "viem";
import { useWallet } from "./WalletProvider";
import {
  approveTokenSpending,
  depositToVault,
  readTokenAllowance,
  readTokenBalance,
  readVaultBalance,
  withdrawFromVault,
  type Workspace,
} from "./workspace";
import {
  DEFAULTS,
  ROBINHOOD_FAUCET_URL,
  SETTLEMENT_ROUTER_ADDRESS,
  TSLA_ADDRESS,
  robinhoodTestnet,
} from "./contracts";

const EXPLORER = robinhoodTestnet.blockExplorers.default.url;

export function YourVaultPanel({ workspace }: { workspace: Workspace }) {
  const { state, adapter } = useWallet();
  const connected = state.status === "connected" ? state : null;

  const [vault, setVault] = useState<bigint>(0n);
  const [wallet, setWalletBal] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [amount, setAmount] = useState<string>("0.25");
  const [lastTx, setLastTx] = useState<Hex | null>(null);
  const [error, setError] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!connected) return;
    try {
      const [v, b, a] = await Promise.all([
        readVaultBalance(adapter.publicClient, workspace.owner),
        readTokenBalance(adapter.publicClient, connected.account),
        readTokenAllowance(adapter.publicClient, connected.account),
      ]);
      setVault(v);
      setWalletBal(b);
      setAllowance(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    }
  }, [adapter, connected, workspace.owner]);

  useEffect(() => {
    void refresh();
    if (!connected) return;
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh, connected]);

  async function doDeposit() {
    if (!connected || !adapter.walletClient) return;
    setError("");
    let parsed: bigint;
    try {
      parsed = parseEther(amount.trim() || "0");
    } catch {
      setError("Invalid amount.");
      return;
    }
    if (parsed <= 0n) {
      setError("Amount must be > 0.");
      return;
    }
    if (parsed > wallet) {
      setError(
        `You only hold ${Number(formatEther(wallet)).toFixed(4)} TSLA.`,
      );
      return;
    }
    setBusy("deposit");
    try {
      /* if allowance is too low, top it up first */
      if (allowance < parsed) {
        await approveTokenSpending(
          adapter.publicClient,
          adapter.walletClient,
          DEFAULTS.periodLimitWei * 10n,
        );
      }
      const tx = await depositToVault(
        adapter.publicClient,
        adapter.walletClient,
        parsed,
      );
      setLastTx(tx);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "deposit failed");
    } finally {
      setBusy(null);
    }
  }

  async function doWithdraw() {
    if (!connected || !adapter.walletClient) return;
    setError("");
    let parsed: bigint;
    try {
      parsed = parseEther(amount.trim() || "0");
    } catch {
      setError("Invalid amount.");
      return;
    }
    if (parsed <= 0n) {
      setError("Amount must be > 0.");
      return;
    }
    if (parsed > vault) {
      setError(
        `Vault holds only ${Number(formatEther(vault)).toFixed(4)} TSLA.`,
      );
      return;
    }
    setBusy("withdraw");
    try {
      const tx = await withdrawFromVault(
        adapter.publicClient,
        adapter.walletClient,
        parsed,
      );
      setLastTx(tx);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "withdraw failed");
    } finally {
      setBusy(null);
    }
  }

  if (!connected) return null;

  return (
    <section className="vaultPanel" aria-label="Your vault">
      <header className="vaultPanelHead">
        <div>
          <span className="vaultEyebrow">Your workspace · {connected.account.slice(0, 6)}…{connected.account.slice(-4)}</span>
          <h2>
            Your TSLA vault, <em>on Robinhood Chain.</em>
          </h2>
        </div>
        <div className="vaultPolicy">
          <span>Policy</span>
          <strong>#{workspace.policyId}</strong>
        </div>
      </header>

      <div className="vaultStats">
        <div className="vaultStat">
          <span className="vaultStatLabel">Vault balance</span>
          <span className="vaultStatValue">
            {Number(formatEther(vault)).toFixed(4)} <em>TSLA</em>
          </span>
          <span className="vaultStatHint">
            SettlementRouter · {short(SETTLEMENT_ROUTER_ADDRESS)}
          </span>
        </div>
        <div className="vaultStat">
          <span className="vaultStatLabel">Wallet balance</span>
          <span className="vaultStatValue">
            {Number(formatEther(wallet)).toFixed(4)} <em>TSLA</em>
          </span>
          <span className="vaultStatHint">
            Token · {short(TSLA_ADDRESS)}
          </span>
        </div>
        <div className="vaultStat">
          <span className="vaultStatLabel">Allowance</span>
          <span className="vaultStatValue">
            {Number(formatEther(allowance)).toFixed(2)} <em>TSLA</em>
          </span>
          <span className="vaultStatHint">router can pull</span>
        </div>
      </div>

      <div className="vaultActions">
        <label className="vaultAmount">
          <span>Amount (TSLA)</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.25"
          />
        </label>
        <button
          type="button"
          className="btn primary"
          onClick={() => void doDeposit()}
          disabled={busy !== null}
        >
          <ArrowDown size={13} />
          {busy === "deposit" ? "Depositing…" : "Deposit"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void doWithdraw()}
          disabled={busy !== null}
        >
          <ArrowUp size={13} />
          {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
        </button>
        <a
          className="btn ghost"
          href={ROBINHOOD_FAUCET_URL}
          target="_blank"
          rel="noreferrer"
          title="TSLA is a role-gated Robinhood token — claim test balances from the faucet"
        >
          <ExternalLink size={13} />
          Get TSLA · faucet
        </a>
        <button
          type="button"
          className="btn ghost"
          onClick={() => void refresh()}
          disabled={busy !== null}
          aria-label="Refresh balances"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {error ? <div className="vaultError">{error}</div> : null}

      {lastTx ? (
        <a
          className="linkOut vaultLastTx"
          href={`${EXPLORER}/tx/${lastTx}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={11} /> last tx · {short(lastTx)}
        </a>
      ) : null}
    </section>
  );
}

function short(value: string) {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
