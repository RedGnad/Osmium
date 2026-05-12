import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileCheck2,
  KeyRound,
  Radio,
  ShieldCheck,
  Wallet,
  XCircle
} from "lucide-react";
import { createPublicClient, formatEther, http, type Address } from "viem";
import "./styles.css";

type DemoPreview = {
  label: string;
  preview: {
    allowed: boolean;
    reason: number;
    reasonName: string;
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
    "0x5e30622c7639aa5edc43313830c9a01341585728") as Address,
  routerAddress: (import.meta.env.VITE_OSMIUM_SETTLEMENT_ROUTER_ADDRESS ??
    "0x1CD04cbD3348D5fa28B30776902464752e878ac7") as Address,
  runnerUrl: import.meta.env.VITE_AGENT_RUNNER_URL ?? "http://127.0.0.1:10000"
};

const assets = [
  { symbol: "TSLA", status: "live", address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" },
  { symbol: "AMD", status: "supported", address: "0x71178BAc73cBeb415514eB542a8995b82669778d" }
] as const;

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

function formatTsla(value: string) {
  return `${(Number(BigInt(value || "0")) / 1e18).toFixed(2)} TSLA`;
}

async function callRunner(path: string) {
  const response = await fetch(`${config.runnerUrl}${path}`, {
    method: path === "/health" ? "GET" : "POST",
    headers: { "content-type": "application/json" }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function App() {
  const [account, setAccount] = useState<string>("not connected");
  const [nativeBalance, setNativeBalance] = useState<string>("--");
  const [runnerStatus, setRunnerStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [activeAsset, setActiveAsset] = useState<"TSLA" | "AMD">("TSLA");
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

  async function refreshLiveProof() {
    setError("");
    try {
      setBusy("proof");
      setSettlement((await callRunner("/demo/live-settlement/preview")) as LiveSettlement);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live proof failed.");
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
          <h1>SpendOps Console</h1>
        </div>
        <button className="iconButton" onClick={connectWallet} title="Connect wallet">
          <Wallet size={18} />
          <span>{short(account)}</span>
        </button>
      </header>

      <section className="statusGrid">
        <Metric icon={<Radio size={18} />} label="Network" value="Robinhood Testnet" detail={`chain ${config.chainId}`} />
        <Metric icon={<ShieldCheck size={18} />} label="Policy Engine" value={short(config.engineAddress)} detail="Stylus" />
        <Metric icon={<CircleDollarSign size={18} />} label="Settlement Router" value={short(config.routerAddress)} detail="Solidity" />
        <Metric icon={<Activity size={18} />} label="Runner" value={runnerStatus} detail={config.runnerUrl.replace(/^https?:\/\//, "")} />
      </section>

      <section className="consoleGrid">
        <AgentPanel account={account} nativeBalance={nativeBalance} activeAsset={activeAsset} setActiveAsset={setActiveAsset} />
        <PolicyPanel activeAsset={activeAsset} />
      </section>

      <section className="workbench">
        <div className="panelHeader">
          <div>
            <span>Live Spend</span>
            <strong>Market Data Merchant</strong>
          </div>
          <div className="toolbar">
            <button onClick={checkRunner} disabled={busy !== ""}>
              <Radio size={17} />
              Health
            </button>
            <button onClick={previewDemo} disabled={busy !== ""}>
              <AlertTriangle size={17} />
              Preview
            </button>
            <button className="primary" onClick={refreshLiveProof} disabled={busy !== ""}>
              <FileCheck2 size={17} />
              Live Proof
            </button>
          </div>
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
              <span>Policy decisions will appear here.</span>
            </div>
          ) : (
            demo.map((item) => <AttemptRow key={item.label} item={item} />)
          )}
        </div>
      </section>

      {settlement ? <SettlementPanel settlement={settlement} /> : null}
      <AuditTrail demo={demo} settlement={settlement} />
    </main>
  );
}

function AgentPanel({
  account,
  nativeBalance,
  activeAsset,
  setActiveAsset
}: {
  account: string;
  nativeBalance: string;
  activeAsset: "TSLA" | "AMD";
  setActiveAsset: (asset: "TSLA" | "AMD") => void;
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <span>AI Finance Agent</span>
          <strong>Market Data Agent</strong>
        </div>
        <Database size={20} />
      </div>
      <div className="dataGrid">
        <DataPoint label="Mission" value="Verified market data" />
        <DataPoint label="Wallet" value={short(account)} />
        <DataPoint label="Gas" value={nativeBalance} />
        <DataPoint label="Policy" value="2" />
      </div>
      <div className="assetTabs">
        {assets.map((asset) => (
          <button
            className={activeAsset === asset.symbol ? "assetTab active" : "assetTab"}
            key={asset.symbol}
            onClick={() => setActiveAsset(asset.symbol)}
          >
            {asset.symbol}
            <span>{asset.status}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PolicyPanel({ activeAsset }: { activeAsset: "TSLA" | "AMD" }) {
  const asset = assets.find((item) => item.symbol === activeAsset) ?? assets[0];
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <span>Policy</span>
          <strong>{asset.symbol} Spend Guard</strong>
        </div>
        <KeyRound size={20} />
      </div>
      <div className="dataGrid">
        <DataPoint label="Token" value={short(asset.address)} />
        <DataPoint label="Merchant" value="verified" />
        <DataPoint label="Max Payment" value="0.50 token" />
        <DataPoint label="Receipt" value="required" />
        <DataPoint label="Replay" value="blocked" />
        <DataPoint label="Context" value="bound" />
      </div>
    </section>
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
      <code>{`reason ${item.preview.reason}`}</code>
    </div>
  );
}

function SettlementPanel({ settlement }: { settlement: LiveSettlement }) {
  return (
    <section className="settlement">
      <div className="panelHeader">
        <div>
          <span>Settlement Evidence</span>
          <strong>Policy {settlement.policyId} / TSLA</strong>
        </div>
        <div className={settlement.replay.blocked ? "badge ok" : "badge blocked"}>{settlement.replay.reasonName}</div>
      </div>

      <div className="settlementGrid">
        <DataPoint label="Amount" value={formatTsla(settlement.amount)} />
        <DataPoint label="Merchant Balance" value={formatTsla(settlement.after.merchantToken)} />
        <DataPoint label="Router Vault" value={formatTsla(settlement.after.routerVault)} />
        <DataPoint label="Settle Tx" value={short(settlement.transactions.settle)} />
        <DataPoint label="Receipt Hash" value={short(settlement.receiptHash)} />
        <DataPoint label="Payment Id" value={short(settlement.paymentId)} />
      </div>
    </section>
  );
}

function AuditTrail({ demo, settlement }: { demo: DemoPreview[]; settlement: LiveSettlement | null }) {
  const rows = [
    ...(settlement
      ? [
          {
            status: "Settled",
            detail: `${formatTsla(settlement.amount)} / receipt ${short(settlement.receiptHash)}`,
            ok: true
          },
          {
            status: "Replay",
            detail: settlement.replay.reasonName,
            ok: settlement.replay.blocked
          }
        ]
      : []),
    ...demo.map((item) => ({
      status: item.preview.allowed ? "Allowed" : "Blocked",
      detail: item.preview.allowed ? item.label : item.preview.reasonName,
      ok: item.preview.allowed
    }))
  ];

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <span>Audit Trail</span>
          <strong>{rows.length} events</strong>
        </div>
        <FileCheck2 size={20} />
      </div>
      <div className="auditRows">
        {rows.length === 0 ? (
          <div className="emptyAudit">No events yet</div>
        ) : (
          rows.map((row, index) => (
            <div className="auditRow" key={`${row.status}-${index}`}>
              <div className={row.ok ? "stateIcon ok" : "stateIcon blocked"}>{row.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}</div>
              <strong>{row.status}</strong>
              <span>{row.detail}</span>
            </div>
          ))
        )}
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
