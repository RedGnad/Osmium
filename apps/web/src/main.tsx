import { StrictMode, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  Database,
  ExternalLink,
  FileCheck2,
  KeyRound,
  Layers3,
  ListChecks,
  LockKeyhole,
  PlayCircle,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Store,
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

type MerchantQuote = {
  asset: AssetSymbol;
  service: string;
  title: string;
  price: string;
  priceWei: string;
  token: string;
  merchant: string;
  serviceId: string;
  dataHash: string;
  receiptHash: string;
  receiptMode: string;
};

type MerchantUnlock = {
  asset: AssetSymbol;
  service: string;
  unlocked: boolean;
  dataHash: string;
  payload: { symbol: string; snapshot: string; settlement: string } | null;
};

type MerchantAuditRecord = {
  paymentId: string;
  asset: AssetSymbol;
  receiptHash: string;
  txHash: string;
  amount: string;
  unlocked: boolean;
  timestamp: number;
};

type SpendEvent = {
  status: "Settled" | "Blocked" | "Unlocked";
  detail: string;
  reason?: string;
  tx?: string;
  receipt?: string;
  ok: boolean;
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

function tokenSymbolFor(address: string) {
  return assets.find((asset) => asset.address.toLowerCase() === address.toLowerCase())?.symbol ?? "TSLA";
}

async function callRunner(path: string, body?: unknown, apiKey?: string) {
  const isGet = path === "/health" || path.startsWith("/merchant/quote") || path === "/merchant/audit";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["x-osmium-api-key"] = apiKey;
  const response = await fetch(`${config.runnerUrl}${path}`, {
    method: isGet ? "GET" : "POST",
    headers,
    body: body && !isGet ? JSON.stringify(body) : undefined
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
  const [quote, setQuote] = useState<MerchantQuote | null>(null);
  const [unlock, setUnlock] = useState<MerchantUnlock | null>(null);
  const [merchantAudit, setMerchantAudit] = useState<MerchantAuditRecord[]>([]);
  const [spendEvents, setSpendEvents] = useState<SpendEvent[]>([]);
  const [operatorKey, setOperatorKey] = useState("");
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

  async function loadMerchantQuote(asset = activeAsset) {
    const nextQuote = (await callRunner(`/merchant/quote?asset=${asset}`)) as MerchantQuote;
    setQuote(nextQuote);
    return nextQuote;
  }

  async function refreshMerchantAudit() {
    setMerchantAudit((await callRunner("/merchant/audit")) as MerchantAuditRecord[]);
  }

  function addSpendEvent(event: SpendEvent) {
    setSpendEvents((events) => [event, ...events].slice(0, 8));
  }

  async function payVerifiedMerchant() {
    setError("");
    try {
      setBusy("pay");
      const nextQuote = await loadMerchantQuote(activeAsset);
      const proof = (await callRunner("/demo/live-settlement/preview")) as LiveSettlement;
      setSettlement(proof);
      const unlocked = (await callRunner("/merchant/receipt", {
        asset: activeAsset,
        paymentId: proof.paymentId,
        receiptHash: proof.receiptHash
      })) as MerchantUnlock;
      setUnlock(unlocked);
      await refreshMerchantAudit();
      addSpendEvent({
        status: unlocked.unlocked ? "Unlocked" : "Blocked",
        detail: `${nextQuote.title} / ${formatToken(proof.amount)}`,
        tx: proof.transactions.settle,
        receipt: proof.receiptHash,
        reason: unlocked.unlocked ? undefined : `${activeAsset} quote has no matching live settlement proof yet`,
        ok: unlocked.unlocked
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merchant payment failed.");
    } finally {
      setBusy("");
    }
  }

  async function executeVerifiedPayment() {
    setError("");
    if (activeAsset !== "TSLA") {
      setError("Operator execution is currently wired to the TSLA live settlement proof. AMD is quote-supported.");
      return;
    }
    if (!operatorKey.trim()) {
      setError("Enter the operator API key to execute a live settlement.");
      return;
    }
    try {
      setBusy("execute");
      const nextQuote = await loadMerchantQuote("TSLA");
      const proof = (await callRunner("/demo/live-settlement/run", undefined, operatorKey.trim())) as LiveSettlement;
      setSettlement(proof);
      const unlocked = (await callRunner("/merchant/receipt", {
        asset: "TSLA",
        paymentId: proof.paymentId,
        receiptHash: proof.receiptHash
      })) as MerchantUnlock;
      setUnlock(unlocked);
      await refreshMerchantAudit();
      addSpendEvent({
        status: unlocked.unlocked ? "Unlocked" : "Settled",
        detail: `${nextQuote.title} / ${formatToken(proof.amount)}`,
        tx: proof.transactions.settle,
        receipt: proof.receiptHash,
        ok: true
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live settlement execution failed.");
    } finally {
      setBusy("");
    }
  }

  async function previewBlockedScenario(kind: "unknown" | "missing" | "over") {
    setError("");
    try {
      setBusy(kind);
      const previews = (await callRunner("/demo/preview")) as DemoPreview[];
      setDemo(previews);
      const match = previews.find((item) =>
        kind === "unknown" ? item.label.includes("unknown") : kind === "missing" ? item.label.includes("missing") : item.label.includes("over")
      );
      if (match) {
        addSpendEvent({
          status: match.preview.allowed ? "Settled" : "Blocked",
          detail: match.label,
          reason: match.preview.reasonName,
          ok: match.preview.allowed
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Blocked scenario preview failed.");
    } finally {
      setBusy("");
    }
  }

  async function replayLastPayment() {
    setError("");
    try {
      setBusy("replay");
      const proof = settlement ?? ((await callRunner("/demo/live-settlement/preview")) as LiveSettlement);
      setSettlement(proof);
      addSpendEvent({
        status: proof.replay.blocked ? "Blocked" : "Settled",
        detail: `payment ${short(proof.paymentId)}`,
        reason: proof.replay.reasonName,
        receipt: proof.receiptHash,
        ok: !proof.replay.blocked
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replay check failed.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    let mounted = true;

    async function hydrateConsole() {
      try {
        await callRunner("/health");
        if (mounted) setRunnerStatus("online");
      } catch {
        if (mounted) setRunnerStatus("offline");
      }

      try {
        const nextQuote = (await callRunner("/merchant/quote?asset=TSLA")) as MerchantQuote;
        if (mounted) setQuote(nextQuote);
      } catch {
        // Keep the initial quote placeholder if the runner is sleeping or not configured yet.
      }

      try {
        const proof = (await callRunner("/demo/live-settlement/preview")) as LiveSettlement;
        if (mounted) setSettlement(proof);
      } catch {
        // Live proof can still be loaded manually once the runner wakes up.
      }

      try {
        const audit = (await callRunner("/merchant/audit")) as MerchantAuditRecord[];
        if (mounted) setMerchantAudit(audit);
      } catch {
        // Audit is optional for the initial paint.
      }
    }

    void hydrateConsole();
    return () => {
      mounted = false;
    };
  }, []);

  const allowed = demo.filter((item) => item.preview.allowed).length;
  const blocked = demo.length - allowed;
  const activeAssetConfig = assets.find((asset) => asset.symbol === activeAsset) ?? assets[0];
  const auditRows = useMemo(() => buildAuditRows(demo, settlement, spendEvents), [demo, settlement, spendEvents]);

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
          <a className="active" href="#overview">
            <Layers3 size={17} />
            Overview
          </a>
          <a href="#agents">
            <Database size={17} />
            Agents
          </a>
          <a href="#policies">
            <SlidersHorizontal size={17} />
            Policies
          </a>
          <a href="#merchants">
            <Store size={17} />
            Merchants
          </a>
          <a href="#settlement">
            <ArrowRightLeft size={17} />
            Live Spend
          </a>
          <a href="#audit">
            <FileCheck2 size={17} />
            Audit
          </a>
          <a href="#developer">
            <Code2 size={17} />
            Developer
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

        <OverviewPanel demo={demo} settlement={settlement} quote={quote} unlock={unlock} />
        <WedgePanel />

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
            <MerchantPanel activeAsset={activeAsset} quote={quote} unlock={unlock} onQuote={() => loadMerchantQuote(activeAsset)} busy={busy !== ""} />
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

            <ScenarioRail
              busy={busy}
              onPay={payVerifiedMerchant}
              onExecute={executeVerifiedPayment}
              onUnknown={() => previewBlockedScenario("unknown")}
              onMissing={() => previewBlockedScenario("missing")}
              onOver={() => previewBlockedScenario("over")}
              onReplay={replayLastPayment}
            />
            <OperatorPanel operatorKey={operatorKey} setOperatorKey={setOperatorKey} activeAsset={activeAsset} busy={busy !== ""} />

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
                  <span>Preview the merchant spend path to load allow/block decisions.</span>
                </div>
              ) : (
                demo.map((item) => <AttemptRow key={item.label} item={item} />)
              )}
            </div>
          </section>
        </section>

        <section className="evidenceGrid">
          <SettlementPanel settlement={settlement} />
          <AuditTrail rows={auditRows} merchantAudit={merchantAudit} />
        </section>

        <DeveloperPanel />
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
    <section className="panel" id="agents">
      <div className="panelHeader">
        <div>
          <span>AI Finance Agent</span>
          <strong>Market Data Agent</strong>
        </div>
        <Database size={20} />
      </div>

      <dl className="infoList">
        <InfoRow label="Mission" value="Buy verified market data" />
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
    <section className="panel" id="policies">
      <div className="panelHeader">
        <div>
          <span>Policy</span>
          <strong>{asset.symbol} Spend Guard</strong>
        </div>
        <KeyRound size={20} />
      </div>

      <dl className="infoList">
        <InfoRow label="Token" value={short(asset.address)} />
        <InfoRow label="Allowlist" value="TSLA / AMD" />
        <InfoRow label="Merchant" value="verified" />
        <InfoRow label="Max Payment" value="0.50 token" />
        <InfoRow label="Period Budget" value="3.00 token" />
        <InfoRow label="Receipt" value="required" />
        <InfoRow label="Replay" value="blocked" />
        <InfoRow label="Context" value="bound" />
      </dl>
    </section>
  );
}

function WedgePanel() {
  return (
    <section className="wedgePanel" id="wedge">
      <div className="wedgeCopy">
        <span className="eyebrow">Agent spending controls</span>
        <strong>Give AI finance agents a budget, not a blank check.</strong>
      </div>
      <div className="flowCompare" aria-label="Normal agent wallet versus Osmium">
        <div className="flowCard weak">
          <span>Normal agent wallet</span>
          <strong>Agent key signs transfer</strong>
          <small>No merchant receipt, no deterministic spend audit.</small>
        </div>
        <ArrowRightLeft size={22} />
        <div className="flowCard strong">
          <span>Osmium path</span>
          <strong>Intent to policy to settlement</strong>
          <small>Merchant, token, amount, receipt, budget and replay checks.</small>
        </div>
      </div>
    </section>
  );
}

function MerchantPanel({
  activeAsset,
  quote,
  unlock,
  onQuote,
  busy
}: {
  activeAsset: AssetSymbol;
  quote: MerchantQuote | null;
  unlock: MerchantUnlock | null;
  onQuote: () => void;
  busy: boolean;
}) {
  return (
    <section className="panel" id="merchants">
      <div className="panelHeader">
        <div>
          <span>Merchant Scenario</span>
          <strong>Verified Market Data API</strong>
        </div>
        <CircleDollarSign size={20} />
      </div>
      <dl className="infoList">
        <InfoRow label="Service" value={quote?.title ?? `${activeAsset} signal package`} />
        <InfoRow label="Price" value={quote ? `${quote.price} ${quote.asset}` : "0.25 token"} />
        <InfoRow label="Receipt" value={quote ? short(quote.receiptHash) : "required"} />
        <InfoRow label="Data" value={unlock?.unlocked ? "unlocked" : "locked"} />
      </dl>
      <button onClick={onQuote} disabled={busy} title="Request merchant quote">
        <Store size={17} />
        Request quote
      </button>
    </section>
  );
}

function ScenarioRail({
  busy,
  onPay,
  onExecute,
  onUnknown,
  onMissing,
  onOver,
  onReplay
}: {
  busy: string;
  onPay: () => void;
  onExecute: () => void;
  onUnknown: () => void;
  onMissing: () => void;
  onOver: () => void;
  onReplay: () => void;
}) {
  const scenarios = [
    { label: "Preview verified payment", state: "allow", action: onPay },
    { label: "Execute settlement", state: "execute", action: onExecute },
    { label: "Try unknown merchant", state: "block", action: onUnknown },
    { label: "Try missing receipt", state: "block", action: onMissing },
    { label: "Try over max", state: "block", action: onOver },
    { label: "Replay last payment", state: "live", action: onReplay }
  ];

  return (
    <div className="scenarioRail" aria-label="Spend scenarios">
      {scenarios.map((scenario) => (
        <button className={`scenarioChip ${scenario.state}`} disabled={busy !== ""} key={scenario.label} onClick={scenario.action}>
          {scenario.state === "allow" ? (
            <CheckCircle2 size={15} />
          ) : scenario.state === "live" ? (
            <FileCheck2 size={15} />
          ) : scenario.state === "execute" ? (
            <PlayCircle size={15} />
          ) : (
            <XCircle size={15} />
          )}
          <span>{scenario.label}</span>
        </button>
      ))}
    </div>
  );
}

function OperatorPanel({
  operatorKey,
  setOperatorKey,
  activeAsset,
  busy
}: {
  operatorKey: string;
  setOperatorKey: (value: string) => void;
  activeAsset: AssetSymbol;
  busy: boolean;
}) {
  return (
    <div className="operatorPanel">
      <div>
        <span>Operator execution</span>
        <strong>{activeAsset === "TSLA" ? "TSLA live settlement enabled" : "AMD quote-supported only"}</strong>
      </div>
      <input
        aria-label="Operator API key"
        disabled={busy}
        onChange={(event) => setOperatorKey(event.target.value)}
        placeholder="x-osmium-api-key"
        type="password"
        value={operatorKey}
      />
    </div>
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

function OverviewPanel({
  demo,
  settlement,
  quote,
  unlock
}: {
  demo: DemoPreview[];
  settlement: LiveSettlement | null;
  quote: MerchantQuote | null;
  unlock: MerchantUnlock | null;
}) {
  const blocked = demo.filter((item) => !item.preview.allowed).length + (settlement?.replay.blocked ? 1 : 0);
  return (
    <section className="overviewGrid" id="overview">
      <div className="overviewHero">
        <span className="eyebrow">Product state</span>
        <strong>Osmium controls how AI finance agents spend tokenized assets.</strong>
      </div>
      <Metric icon={<CircleDollarSign size={17} />} label="Protected Spend" value={settlement ? formatToken(settlement.amount) : "0.25 TSLA"} detail="latest live proof" />
      <Metric icon={<CheckCircle2 size={17} />} label="Settled Payments" value={settlement ? "1" : "0"} detail={quote?.title ?? "market data service"} />
      <Metric icon={<XCircle size={17} />} label="Blocked Attempts" value={String(blocked)} detail={settlement?.replay.reasonName ?? "policy reasons"} />
      <Metric icon={<FileCheck2 size={17} />} label="Latest Receipt" value={settlement ? short(settlement.receiptHash) : "pending"} detail={unlock?.unlocked ? "data unlocked" : "receipt gate"} />
    </section>
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

  const symbol = tokenSymbolFor(settlement.token);
  return (
    <section className="panel proofPanel">
      <div className="panelHeader">
        <div>
          <span>Settlement Evidence</span>
          <strong>
            Policy {settlement.policyId} / {symbol}
          </strong>
        </div>
        <div className={settlement.replay.blocked ? "badge ok" : "badge blocked"}>{settlement.replay.reasonName}</div>
      </div>

      <div className="ledger">
        <LedgerRow label="Amount" value={formatToken(settlement.amount, symbol)} detail="agent spend" />
        <LedgerRow
          label="Merchant"
          value={formatToken(settlement.after.merchantToken, symbol)}
          detail={formatDelta(settlement.before.merchantToken, settlement.after.merchantToken, symbol)}
        />
        <LedgerRow
          label="Router Vault"
          value={formatToken(settlement.after.routerVault, symbol)}
          detail={formatDelta(settlement.before.routerVault, settlement.after.routerVault, symbol)}
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

function AuditTrail({ rows, merchantAudit }: { rows: Array<{ status: string; detail: string; ok: boolean }>; merchantAudit: MerchantAuditRecord[] }) {
  return (
    <section className="panel auditPanel" id="audit">
      <div className="panelHeader">
        <div>
          <span>Audit Trail</span>
          <strong>{rows.length + merchantAudit.length} events</strong>
        </div>
        <FileCheck2 size={20} />
      </div>
      <div className="auditRows">
        {rows.length === 0 && merchantAudit.length === 0 ? (
          <div className="emptyAudit">No events yet</div>
        ) : (
          <>
            {merchantAudit.map((record) => (
              <div className="auditRow" key={record.paymentId}>
                <div className={record.unlocked ? "stateIcon ok" : "stateIcon blocked"}>
                  {record.unlocked ? <CheckCircle2 size={18} /> : <FileCheck2 size={18} />}
                </div>
                <strong>{record.unlocked ? "Unlocked" : "Settled"}</strong>
                <span>
                  {formatToken(record.amount, record.asset)} / receipt {short(record.receiptHash)}
                </span>
              </div>
            ))}
            {rows.map((row, index) => (
              <div className="auditRow" key={`${row.status}-${index}`}>
                <div className={row.ok ? "stateIcon ok" : "stateIcon blocked"}>{row.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}</div>
                <strong>{row.status}</strong>
                <span>{row.detail}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function DeveloperPanel() {
  return (
    <section className="developerPanel" id="developer">
      <div className="panelHeader">
        <div>
          <span>Developer Surface</span>
          <strong>Integrate an agent in 10 minutes</strong>
        </div>
        <Code2 size={20} />
      </div>
      <div className="developerGrid">
        <div className="setupList">
          <div>
            <ListChecks size={17} />
            <span>Connect operator wallet</span>
          </div>
          <div>
            <ListChecks size={17} />
            <span>Select TSLA or AMD policy template</span>
          </div>
          <div>
            <ListChecks size={17} />
            <span>Attach verified merchant and receipt rule</span>
          </div>
          <div>
            <ListChecks size={17} />
            <span>Route agent spend through SettlementRouter</span>
          </div>
        </div>
        <pre>
          <code>{`const quote = await merchant.quote("TSLA");
const intent = await osmium.requestSpend({
  agent: marketDataAgent,
  merchant: quote.merchant,
  token: quote.token,
  amount: quote.priceWei,
  receiptHash: quote.receiptHash
});

await osmium.settleWithIntent(intent);`}</code>
        </pre>
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

function buildAuditRows(demo: DemoPreview[], settlement: LiveSettlement | null, spendEvents: SpendEvent[]) {
  return [
    ...spendEvents,
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
