import { StrictMode } from "react";
import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, CheckCircle2, Flame, KeyRound, Radio, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { createPublicClient, formatEther, http, type Address } from "viem";
import "./styles.css";

type DemoPreview = {
  label: string;
  preview: {
    allowed: boolean;
    reason: number;
    reasonName: string;
  };
  transaction?: {
    hash: string;
    status: string;
    blockNumber: string;
  };
};

type LiveSettlement = {
  policyId: string;
  token: string;
  amount: string;
  paymentId: string;
  receiptHash: string;
  before: {
    merchantToken: string;
    routerVault: string;
  };
  transactions: {
    settle: string;
    settleBlock: string;
  };
  replay: {
    blocked: boolean;
    reasonName: string;
  };
  after: {
    merchantToken: string;
    routerVault: string;
  };
};

const config = {
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? "46630"),
  rpcUrl: import.meta.env.VITE_RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com",
  engineAddress: (import.meta.env.VITE_OSMIUM_POLICY_ENGINE_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as Address,
  runnerUrl: import.meta.env.VITE_AGENT_RUNNER_URL ?? "http://127.0.0.1:10000"
};

const robinhoodTestnet = {
  id: config.chainId,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } }
} as const;

function short(value: string) {
  if (value === "not connected") return "Connect";
  if (!value || value === "0x0000000000000000000000000000000000000000") return "unset";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function callRunner(path: string) {
  const response = await fetch(`${config.runnerUrl}${path}`, {
    method: path === "/health" ? "GET" : "POST",
    headers: {
      "content-type": "application/json"
    }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function App() {
  const [account, setAccount] = useState<string>("not connected");
  const [nativeBalance, setNativeBalance] = useState<string>("--");
  const [runnerStatus, setRunnerStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [demo, setDemo] = useState<DemoPreview[]>([]);
  const [settlement, setSettlement] = useState<LiveSettlement | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function connectWallet() {
    setError("");
    const ethereum = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<string[]> } }).ethereum;
    if (!ethereum) {
      setError("No injected wallet detected.");
      return;
    }
    const [address] = await ethereum.request({ method: "eth_requestAccounts" });
    setAccount(address);

    const client = createPublicClient({ chain: robinhoodTestnet, transport: http(config.rpcUrl) });
    const balance = await client.getBalance({ address: address as Address });
    setNativeBalance(`${Number(formatEther(balance)).toFixed(4)} ETH`);
  }

  async function checkRunner() {
    setError("");
    try {
      setBusy("health");
      await callRunner("/health");
      setRunnerStatus("online");
    } catch (err) {
      setRunnerStatus("offline");
      setError(err instanceof Error ? err.message : "Runner health check failed.");
    } finally {
      setBusy("");
    }
  }

  async function previewDemo() {
    setError("");
    try {
      setBusy("preview");
      setDemo((await callRunner("/demo/preview")) as DemoPreview[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy("");
    }
  }

  async function runDemo() {
    setError("");
    try {
      setBusy("run");
      setSettlement((await callRunner("/demo/live-settlement/run")) as LiveSettlement);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement failed.");
    } finally {
      setBusy("");
    }
  }

  const allowed = demo.filter((item) => item.preview.allowed).length;
  const blocked = demo.length - allowed;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">
            <ShieldCheck size={24} />
            <span>Osmium</span>
          </div>
          <h1>Agentic Payment Firewall</h1>
        </div>
        <button className="iconButton" onClick={connectWallet} title="Connect wallet">
          <Wallet size={18} />
          <span>{short(account)}</span>
        </button>
      </header>

      <section className="statusGrid">
        <Metric icon={<Radio size={18} />} label="Network" value="Robinhood Testnet" detail={`chain ${config.chainId}`} />
        <Metric icon={<KeyRound size={18} />} label="Wallet" value={short(account)} detail={nativeBalance} />
        <Metric icon={<ShieldCheck size={18} />} label="Policy Engine" value={short(config.engineAddress)} detail="Stylus" />
        <Metric
          icon={<Activity size={18} />}
          label="Runner"
          value={runnerStatus}
          detail={config.runnerUrl.replace(/^https?:\/\//, "")}
        />
      </section>

      <section className="workbench">
        <div className="toolbar">
          <button onClick={checkRunner} disabled={busy !== ""}>
            <Radio size={17} />
            Health
          </button>
          <button onClick={previewDemo} disabled={busy !== ""}>
            <AlertTriangle size={17} />
            Preview
          </button>
          <button className="primary" onClick={runDemo} disabled={busy !== ""}>
            <Flame size={17} />
            Settle
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div className="summary">
          <div>
            <span>Allowed</span>
            <strong>{allowed}</strong>
          </div>
          <div>
            <span>Blocked</span>
            <strong>{blocked}</strong>
          </div>
          <div>
            <span>Attempts</span>
            <strong>{demo.length}</strong>
          </div>
        </div>

        <div className="attempts">
          {demo.length === 0 ? (
            <div className="emptyState">
              <ShieldCheck size={42} />
              <span>Run a preview to inspect agent payment policy decisions.</span>
            </div>
          ) : (
            demo.map((item) => <AttemptRow key={item.label} item={item} />)
          )}
        </div>
      </section>

      {settlement ? <SettlementPanel settlement={settlement} /> : null}
    </main>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function AttemptRow({ item }: { item: DemoPreview }) {
  const ok = item.preview.allowed;
  return (
    <div className="attemptRow">
      <div className={ok ? "stateIcon ok" : "stateIcon blocked"}>{ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}</div>
      <div>
        <strong>{item.label}</strong>
        <span>{ok ? "Authorized by policy" : item.preview.reasonName}</span>
      </div>
      <code>{item.transaction?.hash ? short(item.transaction.hash) : `reason ${item.preview.reason}`}</code>
    </div>
  );
}

function formatTsla(value: string) {
  return `${(Number(BigInt(value)) / 1e18).toFixed(2)} TSLA`;
}

function SettlementPanel({ settlement }: { settlement: LiveSettlement }) {
  return (
    <section className="settlement">
      <div className="panelHeader">
        <div>
          <span>Live Settlement</span>
          <strong>Policy {settlement.policyId} / TSLA</strong>
        </div>
        <div className={settlement.replay.blocked ? "badge ok" : "badge blocked"}>{settlement.replay.reasonName}</div>
      </div>

      <div className="settlementGrid">
        <DataPoint label="Amount" value={formatTsla(settlement.amount)} />
        <DataPoint label="Merchant Before" value={formatTsla(settlement.before.merchantToken)} />
        <DataPoint label="Merchant After" value={formatTsla(settlement.after.merchantToken)} />
        <DataPoint label="Router Before" value={formatTsla(settlement.before.routerVault)} />
        <DataPoint label="Router After" value={formatTsla(settlement.after.routerVault)} />
        <DataPoint label="Settle Block" value={settlement.transactions.settleBlock} />
      </div>

      <div className="evidence">
        <DataPoint label="Settle Tx" value={short(settlement.transactions.settle)} />
        <DataPoint label="Receipt Hash" value={short(settlement.receiptHash)} />
        <DataPoint label="Payment Id" value={short(settlement.paymentId)} />
      </div>
    </section>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="dataPoint">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
