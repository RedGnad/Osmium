import { StrictMode, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CircleDollarSign,
  Database,
  ExternalLink,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
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
  intentHash: string;
  contextHash: string;
  before: {
    merchantToken: string;
    routerVault: string;
  };
  transactions: {
    approve?: string;
    deposit?: string;
    settle: string;
    settleBlock: string;
  };
  replay: {
    blocked: boolean;
    reason: number;
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
  runnerUrl: import.meta.env.VITE_AGENT_RUNNER_URL ?? "http://127.0.0.1:10000",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com"
};

const assets = [
  {
    symbol: "TSLA",
    status: "live proof",
    address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    tone: "Tokenized equity"
  },
  {
    symbol: "AMD",
    status: "supported",
    address: "0x71178BAc73cBeb415514eB542a8995b82669778d",
    tone: "AI infra asset"
  }
] as const;

type AssetSymbol = (typeof assets)[number]["symbol"];

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

function tokenUnits(value: string) {
  return Number(BigInt(value || "0")) / 1e18;
}

function formatToken(value: string, symbol = "TSLA") {
  return `${tokenUnits(value).toFixed(2)} ${symbol}`;
}

function formatDelta(before: string, after: string, symbol = "TSLA") {
  const delta = tokenUnits(after) - tokenUnits(before);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)} ${symbol}`;
}

function txUrl(hash: string) {
  return `${config.explorerUrl}/tx/${hash}`;
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
  const [activeAsset, setActiveAsset] = useState<AssetSymbol>("TSLA");
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
  const activeAssetConfig = assets.find((asset) => asset.symbol === activeAsset) ?? assets[0];
  const auditRows = useMemo(() => buildAuditRows(demo, settlement), [demo, settlement]);

  return (
    <main className="appShell">
      <aside className="sideRail">
        <div className="brandLockup">
          <div className="brandMark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <span>Osmium</span>
            <strong>SpendOps</strong>
          </div>
        </div>

        <nav className="railNav" aria-label="Console sections">
          <a className="active" href="#agent">
            <Database size={17} />
            Agent
          </a>
          <a href="#policy">
            <SlidersHorizontal size={17} />
            Policy
          </a>
          <a href="#settlement">
            <ArrowRightLeft size={17} />
            Settlement
          </a>
          <a href="#audit">
            <FileCheck2 size={17} />
            Audit
          </a>
        </nav>

        <div className="railCard">
          <span>Runtime</span>
          <strong>{runnerStatus}</strong>
          <small>{config.runnerUrl.replace(/^https?:\/\//, "")}</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Onchain control plane</span>
            <h1>AI Finance Agent Operations</h1>
          </div>
          <button className="walletButton" onClick={connectWallet} title="Connect wallet">
            <Wallet size={18} />
            <span>{short(account)}</span>
          </button>
        </header>

        <section className="systemStrip" aria-label="System state">
          <Metric icon={<Radio size={17} />} label="Network" value="Robinhood Testnet" detail={`chain ${config.chainId}`} />
          <Metric icon={<ShieldCheck size={17} />} label="Policy Engine" value={short(config.engineAddress)} detail="Stylus / Rust" />
          <Metric icon={<CircleDollarSign size={17} />} label="Settlement Router" value={short(config.routerAddress)} detail="Solidity custody" />
          <Metric icon={<Activity size={17} />} label="Runner" value={runnerStatus} detail="preview + live proof" />
        </section>

        <section className="mainGrid">
          <div className="leftColumn">
            <AgentPanel
              account={account}
              nativeBalance={nativeBalance}
              activeAsset={activeAsset}
              activeAssetConfig={activeAssetConfig}
              setActiveAsset={setActiveAsset}
            />
            <PolicyPanel activeAsset={activeAsset} />
          </div>

          <section className="decisionDesk" id="settlement">
            <div className="panelHeader">
              <div>
                <span>Live Spend</span>
                <strong>Market Data Merchant</strong>
              </div>
              <div className="toolbar">
                <button onClick={checkRunner} disabled={busy !== ""} title="Check runner health">
                  <Radio size={17} />
                  Health
                </button>
                <button onClick={previewDemo} disabled={busy !== ""} title="Preview policy decisions">
                  <AlertTriangle size={17} />
                  Preview
                </button>
                <button className="primary" onClick={refreshLiveProof} disabled={busy !== ""} title="Read latest live settlement proof">
                  <FileCheck2 size={17} />
                  Live Proof
                </button>
              </div>
            </div>

            {error ? <div className="error">{error}</div> : null}

            <div className="decisionSummary">
              <Kpi label="Allowed" value={String(allowed)} />
              <Kpi label="Blocked" value={String(blocked)} />
              <Kpi label="Attempts" value={String(demo.length)} />
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
        </section>

        <section className="evidenceGrid">
          <SettlementPanel settlement={settlement} />
          <AuditTrail rows={auditRows} />
        </section>
      </section>
    </main>
  );
}

function AgentPanel({
  account,
  nativeBalance,
  activeAsset,
  activeAssetConfig,
  setActiveAsset
}: {
  account: string;
  nativeBalance: string;
  activeAsset: AssetSymbol;
  activeAssetConfig: (typeof assets)[number];
  setActiveAsset: (asset: AssetSymbol) => void;
}) {
  return (
    <section className="panel" id="agent">
      <div className="panelHeader">
        <div>
          <span>AI Finance Agent</span>
          <strong>Market Data Agent</strong>
        </div>
        <Database size={20} />
      </div>

      <dl className="infoList">
        <InfoRow label="Mission" value="Verified market data" />
        <InfoRow label="Wallet" value={short(account)} />
        <InfoRow label="Gas" value={nativeBalance} />
        <InfoRow label="Policy" value="2" />
      </dl>

      <div className="assetTabs" aria-label="Asset policy selector">
        {assets.map((asset) => (
          <button
            className={activeAsset === asset.symbol ? "assetTab active" : "assetTab"}
            key={asset.symbol}
            onClick={() => setActiveAsset(asset.symbol)}
            title={`${asset.symbol} policy`}
          >
            <strong>{asset.symbol}</strong>
            <span>{asset.status}</span>
          </button>
        ))}
      </div>

      <div className="assetNote">
        <LockKeyhole size={16} />
        <span>{activeAssetConfig.tone}</span>
      </div>
    </section>
  );
}

function PolicyPanel({ activeAsset }: { activeAsset: AssetSymbol }) {
  const asset = assets.find((item) => item.symbol === activeAsset) ?? assets[0];
  return (
    <section className="panel" id="policy">
      <div className="panelHeader">
        <div>
          <span>Policy</span>
          <strong>{asset.symbol} Spend Guard</strong>
        </div>
        <KeyRound size={20} />
      </div>

      <dl className="infoList">
        <InfoRow label="Token" value={short(asset.address)} />
        <InfoRow label="Merchant" value="verified" />
        <InfoRow label="Max Payment" value="0.50 token" />
        <InfoRow label="Receipt" value="required" />
        <InfoRow label="Replay" value="blocked" />
        <InfoRow label="Context" value="bound" />
      </dl>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
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

function SettlementPanel({ settlement }: { settlement: LiveSettlement | null }) {
  if (!settlement) {
    return (
      <section className="panel proofPanel">
        <div className="panelHeader">
          <div>
            <span>Settlement Evidence</span>
            <strong>Awaiting live proof</strong>
          </div>
          <ArrowRightLeft size={20} />
        </div>
        <div className="emptyProof">
          <CircleDollarSign size={42} />
          <span>Run Live Proof to load the latest TSLA settlement state.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel proofPanel">
      <div className="panelHeader">
        <div>
          <span>Settlement Evidence</span>
          <strong>Policy {settlement.policyId} / TSLA</strong>
        </div>
        <div className={settlement.replay.blocked ? "badge ok" : "badge blocked"}>{settlement.replay.reasonName}</div>
      </div>

      <div className="ledger">
        <LedgerRow label="Amount" value={formatToken(settlement.amount)} detail="agent spend" />
        <LedgerRow
          label="Merchant"
          value={formatToken(settlement.after.merchantToken)}
          detail={formatDelta(settlement.before.merchantToken, settlement.after.merchantToken)}
        />
        <LedgerRow
          label="Router Vault"
          value={formatToken(settlement.after.routerVault)}
          detail={formatDelta(settlement.before.routerVault, settlement.after.routerVault)}
        />
        <LedgerRow label="Payment Id" value={short(settlement.paymentId)} detail="anti-replay key" />
        <LedgerRow label="Receipt" value={short(settlement.receiptHash)} detail="stored onchain" />
        <LedgerRow label="Context" value={short(settlement.contextHash)} detail="intent binding" />
      </div>

      {settlement.transactions.settle ? (
        <a className="txLink" href={txUrl(settlement.transactions.settle)} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          {short(settlement.transactions.settle)}
        </a>
      ) : null}
    </section>
  );
}

function AuditTrail({ rows }: { rows: Array<{ status: string; detail: string; ok: boolean }> }) {
  return (
    <section className="panel auditPanel" id="audit">
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="infoRow">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function LedgerRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="ledgerRow">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function buildAuditRows(demo: DemoPreview[], settlement: LiveSettlement | null) {
  return [
    ...(settlement
      ? [
          {
            status: "Settled",
            detail: `${formatToken(settlement.amount)} / receipt ${short(settlement.receiptHash)}`,
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
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
