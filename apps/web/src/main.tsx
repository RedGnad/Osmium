import {
  StrictMode,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  PlayCircle,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Wallet,
  XCircle,
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

type X402PaymentRequired = {
  x402Version: 2;
  error: "payment_required";
  protocol: "x402-compatible-osmium";
  accepts: Array<{
    scheme: "osmium-exact";
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    resource: {
      url: string;
      description: string;
      mimeType: string;
    };
    extra: {
      assetSymbol: AssetSymbol;
      receiptHash: string;
      paymentId: string;
      serviceId: string;
      dataHash: string;
      merchant: string;
      policyId: string;
      intentHash: string;
      contextHash: string;
      settlement: "osmium-delegated-vault";
    };
  }>;
};

type X402FlowState = {
  asset?: AssetSymbol;
  service?: string;
  protocol?: string;
  scheme?: string;
  network?: string;
  requestStatus?: number;
  verifyStatus?: string;
  verifyValid?: boolean;
  unlockStatus?: number;
  amount?: string;
  token?: string;
  merchant?: string;
  serviceId?: string;
  dataHash?: string;
  paymentId?: string;
  receiptHash?: string;
  txHash?: string;
  paymentRequired?: X402PaymentRequired;
  paymentResponse?: string;
  unlocked?: boolean;
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
  status: "Cleared" | "Denied" | "Filed";
  detail: string;
  reason?: string;
  tx?: string;
  receipt?: string;
  ok: boolean;
};

const config = {
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? "46630"),
  rpcUrl:
    import.meta.env.VITE_RH_RPC_URL ??
    "https://rpc.testnet.chain.robinhood.com",
  engineAddress: (import.meta.env.VITE_OSMIUM_POLICY_ENGINE_ADDRESS ??
    "0x5e30622c7639aa5edc43313830c9a01341585728") as Address,
  routerAddress: (import.meta.env.VITE_OSMIUM_SETTLEMENT_ROUTER_ADDRESS ??
    "0x1CD04cbD3348D5fa28B30776902464752e878ac7") as Address,
  runnerUrl: import.meta.env.VITE_AGENT_RUNNER_URL ?? "http://127.0.0.1:10000",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
};

const assets = [
  {
    symbol: "TSLA",
    status: "live proof",
    address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    tone: "Tokenized equity",
  },
  {
    symbol: "AMD",
    status: "supported",
    address: "0x71178BAc73cBeb415514eB542a8995b82669778d",
    tone: "AI infra asset",
  },
] as const;

type AssetSymbol = (typeof assets)[number]["symbol"];

type ConsoleView =
  | "command"
  | "policy"
  | "merchant"
  | "audit"
  | "developer"
  | "settings";

const viewCopy: Record<
  ConsoleView,
  { eyebrow: string; title: string; description: string }
> = {
  command: {
    eyebrow: "Clearance room",
    title: "Osmium Clearance Room",
    description:
      "Give agents clearance, not keys. Agents do not spend; they request clearance.",
  },
  policy: {
    eyebrow: "Policy rulebook",
    title: "TSLA Clearance Policy",
    description:
      "The deterministic rules that decide whether an agent request can be cleared.",
  },
  merchant: {
    eyebrow: "Protected resource",
    title: "Verified Market Data API",
    description:
      "The paid market-data resource that stays locked until clearance is granted.",
  },
  audit: {
    eyebrow: "Proof ledger",
    title: "Proof Ledger",
    description:
      "A financial record of issued 402s, clearance decisions, receipts and replay denials.",
  },
  developer: {
    eyebrow: "Developer surface",
    title: "Integrate clearance in 10 minutes",
    description:
      "Request a protected resource, verify clearance, settle through Osmium, then unlock.",
  },
  settings: {
    eyebrow: "Settings",
    title: "Live clearance runtime",
    description:
      "Live deployment details, supported network and honest prototype boundaries.",
  },
};

function getInitialView(): ConsoleView {
  if (typeof window === "undefined") return "command";
  const hash = window.location.hash.replace("#", "");
  return hash in viewCopy ? (hash as ConsoleView) : "command";
}

const robinhoodTestnet = {
  id: config.chainId,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

function short(value: string) {
  if (value === "not connected") return "Connect";
  if (!value || value === "0x0000000000000000000000000000000000000000")
    return "unset";
  if (value.length <= 12) return value;
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

function formatAuditTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function txUrl(hash: string) {
  return `${config.explorerUrl}/tx/${hash}`;
}

function isFullTxHash(hash: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

function tokenSymbolFor(address: string) {
  return (
    assets.find(
      (asset) => asset.address.toLowerCase() === address.toLowerCase(),
    )?.symbol ?? "TSLA"
  );
}

async function callRunner(path: string, body?: unknown, apiKey?: string) {
  const isGet =
    path === "/health" ||
    path.startsWith("/merchant/quote") ||
    path === "/merchant/audit";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers["x-osmium-api-key"] = apiKey;
  const response = await fetch(`${config.runnerUrl}${path}`, {
    method: isGet ? "GET" : "POST",
    headers,
    body: body && !isGet ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function callRunnerRawGet(path: string) {
  const response = await fetch(`${config.runnerUrl}${path}`, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
  const body = await response.json();
  return {
    status: response.status,
    body,
    paymentRequired: response.headers.get("PAYMENT-REQUIRED"),
    paymentResponse: response.headers.get("PAYMENT-RESPONSE"),
  };
}

function buildX402PaymentPayload(flow: X402FlowState) {
  const accepted = flow.paymentRequired?.accepts[0];
  if (!accepted) throw new Error("Request market data first to receive PAYMENT-REQUIRED.");
  return {
    x402Version: 2,
    accepted,
    payload: {
      scheme: "osmium-delegated-vault",
      policyId: accepted.extra.policyId,
      intentHash: accepted.extra.intentHash,
      contextHash: accepted.extra.contextHash,
      merchant: accepted.extra.merchant,
      paymentId: accepted.extra.paymentId,
      receiptHash: accepted.extra.receiptHash,
    },
    resource: accepted.resource,
  };
}

function App() {
  const [account, setAccount] = useState<string>("not connected");
  const [nativeBalance, setNativeBalance] = useState<string>("--");
  const [runnerStatus, setRunnerStatus] = useState<
    "unknown" | "online" | "offline"
  >("unknown");
  const [activeAsset, setActiveAsset] = useState<AssetSymbol>("TSLA");
  const [demo, setDemo] = useState<DemoPreview[]>([]);
  const [settlement, setSettlement] = useState<LiveSettlement | null>(null);
  const [quote, setQuote] = useState<MerchantQuote | null>(null);
  const [unlock, setUnlock] = useState<MerchantUnlock | null>(null);
  const [x402Flow, setX402Flow] = useState<X402FlowState>({});
  const [merchantAudit, setMerchantAudit] = useState<MerchantAuditRecord[]>([]);
  const [spendEvents, setSpendEvents] = useState<SpendEvent[]>([]);
  const [operatorKey, setOperatorKey] = useState("");
  const [view, setView] = useState<ConsoleView>(getInitialView);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function connectWallet() {
    setError("");
    const ethereum = (
      window as unknown as {
        ethereum?: { request: (args: unknown) => Promise<string[]> };
      }
    ).ethereum;
    if (!ethereum) {
      setError("No injected wallet detected.");
      return;
    }
    const [address] = await ethereum.request({ method: "eth_requestAccounts" });
    setAccount(address);

    const client = createPublicClient({
      chain: robinhoodTestnet,
      transport: http(config.rpcUrl),
    });
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
      setError(
        err instanceof Error ? err.message : "Runner health check failed.",
      );
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
      setSettlement(
        (await callRunner("/demo/live-settlement/preview")) as LiveSettlement,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live proof failed.");
    } finally {
      setBusy("");
    }
  }

  async function loadMerchantQuote(asset = activeAsset) {
    const nextQuote = (await callRunner(
      `/merchant/quote?asset=${asset}`,
    )) as MerchantQuote;
    setQuote(nextQuote);
    return nextQuote;
  }

  async function refreshMerchantAudit() {
    setMerchantAudit(
      (await callRunner("/merchant/audit")) as MerchantAuditRecord[],
    );
  }

  function addSpendEvent(event: SpendEvent) {
    setSpendEvents((events) => [event, ...events].slice(0, 8));
  }

  function selectView(nextView: ConsoleView) {
    setView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
  }

  async function requestMarketDataResource(asset = activeAsset) {
    setError("");
    try {
      setBusy("x402-request");
      const response = await callRunnerRawGet(
        `/merchant/market-data?asset=${asset}`,
      );
      const paymentRequired = response.body as X402PaymentRequired;
      const accepted = paymentRequired.accepts?.[0];
      setX402Flow({
        asset,
        service: accepted?.extra?.assetSymbol
          ? `${accepted.extra.assetSymbol} market data`
          : "market_data_snapshot",
        protocol: paymentRequired.protocol,
        scheme: accepted?.scheme,
        network: accepted?.network,
        requestStatus: response.status,
        amount: accepted?.amount,
        token: accepted?.asset,
        merchant: accepted?.extra?.merchant,
        serviceId: accepted?.extra?.serviceId,
        dataHash: accepted?.extra?.dataHash,
        paymentId: accepted?.extra?.paymentId,
        receiptHash: accepted?.extra?.receiptHash,
        paymentRequired,
        unlocked: false,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Market-data resource request failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function verifyX402Flow() {
    setError("");
    try {
      setBusy("x402-verify");
      const paymentPayload = buildX402PaymentPayload(x402Flow);
      const result = (await callRunner("/x402/verify", {
        x402Version: 2,
        paymentRequirements: x402Flow.paymentRequired,
        paymentPayload,
      })) as {
        isValid: boolean;
        invalidReason?: string;
        invalidMessage?: string;
      };
      setX402Flow((current) => ({
        ...current,
        verifyStatus: result.isValid
          ? "valid"
          : (result.invalidReason ?? "invalid"),
        verifyValid: result.isValid,
      }));
      if (!result.isValid) {
        setError(result.invalidMessage ?? "x402 verification failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "x402 verification failed.");
    } finally {
      setBusy("");
    }
  }

  async function settleX402Flow() {
    setError("");
    if (activeAsset !== "TSLA") {
      setError("x402 settlement is currently wired to the TSLA live proof. AMD is quote-supported.");
      return;
    }
    if (!operatorKey.trim()) {
      setError("Enter the operator API key to execute x402 settlement.");
      return;
    }
    try {
      setBusy("x402-settle");
      const paymentPayload = buildX402PaymentPayload(x402Flow);
      const result = (await callRunner(
        "/x402/settle",
        {
          x402Version: 2,
          paymentRequirements: x402Flow.paymentRequired,
          paymentPayload,
        },
        operatorKey.trim(),
      )) as {
        success: boolean;
        transaction?: string;
        paymentId?: string;
        receiptHash?: string;
        settlement?: LiveSettlement;
        errorMessage?: string;
      };
      if (!result.success) throw new Error(result.errorMessage ?? "x402 settlement failed.");
      if (result.settlement) setSettlement(result.settlement);
      const resource = await callRunnerRawGet(
        `/merchant/market-data?asset=TSLA&paymentId=${result.paymentId}&receiptHash=${result.receiptHash}`,
      );
      await refreshMerchantAudit();
      setX402Flow((current) => ({
        ...current,
        unlockStatus: resource.status,
        paymentId: result.paymentId,
        receiptHash: result.receiptHash,
        txHash: result.transaction,
        paymentResponse: resource.paymentResponse ?? undefined,
        unlocked: resource.status === 200,
      }));
      addSpendEvent({
        status: "Filed",
        detail: "RECEIPT FILED / x402-compatible TSLA market data",
        tx: result.transaction,
        receipt: result.receiptHash,
        ok: resource.status === 200,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "x402 settlement failed.");
    } finally {
      setBusy("");
    }
  }

  async function payVerifiedMerchant() {
    setError("");
    try {
      setBusy("pay");
      const nextQuote = await loadMerchantQuote(activeAsset);
      const proof = (await callRunner(
        "/demo/live-settlement/preview",
      )) as LiveSettlement;
      setSettlement(proof);
      const unlocked = (await callRunner("/merchant/receipt", {
        asset: activeAsset,
        paymentId: proof.paymentId,
        receiptHash: proof.receiptHash,
      })) as MerchantUnlock;
      setUnlock(unlocked);
      await refreshMerchantAudit();
      addSpendEvent({
        status: unlocked.unlocked ? "Filed" : "Denied",
        detail: `${nextQuote.title} / ${formatToken(proof.amount)}`,
        tx: proof.transactions.settle,
        receipt: proof.receiptHash,
        reason: unlocked.unlocked
          ? undefined
          : `${activeAsset} quote has no matching live settlement proof yet`,
        ok: unlocked.unlocked,
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
      setError(
        "Operator execution is currently wired to the TSLA live settlement proof. AMD is quote-supported.",
      );
      return;
    }
    if (!operatorKey.trim()) {
      setError("Enter the operator API key to execute a live settlement.");
      return;
    }
    try {
      setBusy("execute");
      const nextQuote = await loadMerchantQuote("TSLA");
      const proof = (await callRunner(
        "/demo/live-settlement/run",
        undefined,
        operatorKey.trim(),
      )) as LiveSettlement;
      setSettlement(proof);
      const unlocked = (await callRunner("/merchant/receipt", {
        asset: "TSLA",
        paymentId: proof.paymentId,
        receiptHash: proof.receiptHash,
      })) as MerchantUnlock;
      const resource = await callRunnerRawGet(
        `/merchant/market-data?asset=TSLA&paymentId=${proof.paymentId}&receiptHash=${proof.receiptHash}`,
      );
      setUnlock(unlocked);
      setX402Flow((current) => ({
        ...current,
        asset: "TSLA",
        service: unlocked.service,
        unlockStatus: resource.status,
        paymentId: proof.paymentId,
        receiptHash: proof.receiptHash,
        dataHash: unlocked.dataHash,
        txHash: proof.transactions.settle,
        unlocked: resource.status === 200 && unlocked.unlocked,
      }));
      await refreshMerchantAudit();
      addSpendEvent({
        status: unlocked.unlocked ? "Filed" : "Cleared",
        detail: `${nextQuote.title} / ${formatToken(proof.amount)}`,
        tx: proof.transactions.settle,
        receipt: proof.receiptHash,
        ok: true,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Live settlement execution failed.",
      );
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
        kind === "unknown"
          ? item.label.includes("unknown")
          : kind === "missing"
            ? item.label.includes("missing")
            : item.label.includes("over"),
      );
      if (match) {
        addSpendEvent({
          status: match.preview.allowed ? "Cleared" : "Denied",
          detail: match.label,
          reason: match.preview.reasonName,
          ok: match.preview.allowed,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Denied scenario preview failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function replayLastPayment() {
    setError("");
    try {
      setBusy("replay");
      const proof =
        settlement ??
        ((await callRunner("/demo/live-settlement/preview")) as LiveSettlement);
      setSettlement(proof);
      addSpendEvent({
        status: proof.replay.blocked ? "Denied" : "Cleared",
        detail: `payment ${short(proof.paymentId)}`,
        reason: proof.replay.reasonName,
        receipt: proof.receiptHash,
        ok: !proof.replay.blocked,
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
        const nextQuote = (await callRunner(
          "/merchant/quote?asset=TSLA",
        )) as MerchantQuote;
        if (mounted) setQuote(nextQuote);
      } catch {
        // Keep the initial quote placeholder if the runner is sleeping or not configured yet.
      }

      try {
        const proof = (await callRunner(
          "/demo/live-settlement/preview",
        )) as LiveSettlement;
        if (mounted) setSettlement(proof);
      } catch {
        // Live proof can still be loaded manually once the runner wakes up.
      }

      try {
        const audit = (await callRunner(
          "/merchant/audit",
        )) as MerchantAuditRecord[];
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

  useEffect(() => {
    function syncViewFromHash() {
      setView(getInitialView());
    }

    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  const allowed = demo.filter((item) => item.preview.allowed).length;
  const blocked = demo.length - allowed;
  const auditRows = useMemo(
    () => buildAuditRows(demo, settlement, spendEvents),
    [demo, settlement, spendEvents],
  );
  const currentView = viewCopy[view];
  const navItems: Array<{
    id: ConsoleView;
    label: string;
    icon: ReactNode;
  }> = [
    { id: "command", label: "Command Center", icon: <Layers3 size={17} /> },
    { id: "policy", label: "Policy", icon: <KeyRound size={17} /> },
    { id: "merchant", label: "Merchant", icon: <Store size={17} /> },
    { id: "audit", label: "Audit", icon: <FileCheck2 size={17} /> },
    { id: "developer", label: "Developer", icon: <Code2 size={17} /> },
    { id: "settings", label: "Settings", icon: <SlidersHorizontal size={17} /> },
  ];
  const riskWorkbench = (
    <section className="decisionDesk">
      <div className="panelHeader">
        <div>
          <span>Risk Test Bench</span>
          <strong>Allow / block decisions</strong>
        </div>
        <div className="toolbar">
          <button
            onClick={checkRunner}
            disabled={busy !== ""}
            title="Check runner health"
          >
            <Radio size={17} />
            Health
          </button>
          <button
            onClick={previewDemo}
            disabled={busy !== ""}
            title="Preview policy decisions"
          >
            <AlertTriangle size={17} />
            Preview
          </button>
          <button
            className="primary"
            onClick={refreshLiveProof}
            disabled={busy !== ""}
            title="Read latest proof ledger state"
          >
            <FileCheck2 size={17} />
            Proof Ledger
          </button>
        </div>
      </div>

      <ScenarioRail
        busy={busy}
        onPay={payVerifiedMerchant}
        onExecute={refreshLiveProof}
        onUnknown={() => previewBlockedScenario("unknown")}
        onMissing={() => previewBlockedScenario("missing")}
        onOver={() => previewBlockedScenario("over")}
        onReplay={replayLastPayment}
      />

      <div className="decisionSummary">
        <Kpi label="Cleared" value={String(allowed)} />
        <Kpi label="Denied" value={String(blocked)} />
        <Kpi label="Requests" value={String(demo.length)} />
      </div>

      <div className="attempts">
        {demo.length === 0 ? (
          <div className="emptyState">
            <ShieldCheck size={42} />
            <span>
              Preview the merchant request path to load clearance decisions.
            </span>
          </div>
        ) : (
          demo.map((item) => <AttemptRow key={item.label} item={item} />)
        )}
      </div>
    </section>
  );

  return (
    <main className="appShell">
      <aside className="sideRail">
        <div className="brandLockup">
          <div className="brandMark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <span>Osmium</span>
            <strong>Clearance Room</strong>
          </div>
        </div>

        <nav className="railNav" aria-label="Console sections">
          {navItems.map((item) => (
            <button
              className={view === item.id ? "active" : ""}
              key={item.id}
              onClick={() => selectView(item.id)}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
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
            <span className="eyebrow">{currentView.eyebrow}</span>
            <h1>{currentView.title}</h1>
            <p>{currentView.description}</p>
            <TopBadges runnerStatus={runnerStatus} />
          </div>
          <button
            className="walletButton"
            onClick={connectWallet}
            title="Connect wallet"
          >
            <Wallet size={18} />
            <span>{short(account)}</span>
          </button>
        </header>

        <nav className="mobileNav" aria-label="Console sections">
          {navItems.map((item) => (
            <button
              className={view === item.id ? "active" : ""}
              key={item.id}
              onClick={() => selectView(item.id)}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {error ? <div className="error">{error}</div> : null}

        {view === "command" ? (
          <section className="viewStack commandView">
            <CommandStatusStrip
              activeAsset={activeAsset}
              quote={quote}
              runnerStatus={runnerStatus}
              settlement={settlement}
            />
            <section className="cockpitGrid">
              <X402FlowPanel
                activeAsset={activeAsset}
                busy={busy}
                flow={x402Flow}
                merchantAudit={merchantAudit}
                operatorKey={operatorKey}
                settlement={settlement}
                setOperatorKey={setOperatorKey}
                onExecute={executeVerifiedPayment}
                onRequest={() => requestMarketDataResource(activeAsset)}
                onSettle={settleX402Flow}
                onVerify={verifyX402Flow}
              />
              <aside className="operatorSnapshot">
                <CockpitSummary
                  activeAsset={activeAsset}
                  account={account}
                  nativeBalance={nativeBalance}
                  quote={quote}
                  runnerStatus={runnerStatus}
                  settlement={settlement}
                />
                <SettlementPanel settlement={settlement} />
              </aside>
            </section>
            <details className="secondaryDrills">
              <summary>Denied request drills</summary>
              {riskWorkbench}
            </details>
          </section>
        ) : null}

        {view === "policy" ? (
          <section className="viewStack policyView">
            <PolicyPanel activeAsset={activeAsset} />
          </section>
        ) : null}

        {view === "merchant" ? (
          <section className="viewStack merchantView">
            <MerchantPanel
              activeAsset={activeAsset}
              quote={quote}
              unlock={unlock}
              onQuote={() => loadMerchantQuote(activeAsset)}
              busy={busy !== ""}
            />
          </section>
        ) : null}

        {view === "audit" ? (
          <section className="viewStack auditView">
            <section className="evidenceGrid">
              <SettlementPanel settlement={settlement} />
              <AuditTrail rows={auditRows} merchantAudit={merchantAudit} />
            </section>
          </section>
        ) : null}

        {view === "developer" ? (
          <section className="viewStack developerView">
            <DeveloperPanel />
          </section>
        ) : null}

        {view === "settings" ? (
          <section className="viewStack settingsView">
            <SettingsPanel runnerStatus={runnerStatus} />
          </section>
        ) : null}
      </section>
    </main>
  );
}

function PolicyPanel({ activeAsset }: { activeAsset: AssetSymbol }) {
  const asset = assets.find((item) => item.symbol === activeAsset) ?? assets[0];
  return (
    <section className="policyGrid" id="policies">
      <section className="panel policyHero">
        <div className="panelHeader">
          <div>
            <span>Clearance rulebook</span>
            <strong>{asset.symbol} Clearance Policy</strong>
          </div>
          <StatusStamp tone="cleared">ARMED</StatusStamp>
        </div>
        <p>
          This policy turns an agent request into a deterministic clearance
          decision before any vault funds can move.
        </p>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Scope</span>
            <strong>Supported assets</strong>
          </div>
          <CircleDollarSign size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="TSLA" value="live settlement" />
          <InfoRow label="AMD" value="quote-supported" />
          <InfoRow label="Network" value="Robinhood Chain Testnet" />
        </dl>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Limits</span>
            <strong>Spend limits</strong>
          </div>
          <KeyRound size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="Max payment" value="0.50 token" />
          <InfoRow label="Period budget" value="3.00 token" />
          <InfoRow label="Funds move" value="router only" />
        </dl>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Evidence rules</span>
            <strong>Evidence required</strong>
          </div>
          <FileCheck2 size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="Merchant" value="verified only" />
          <InfoRow label="Filed receipt" value="required" />
          <InfoRow label="Context" value="bound" />
          <InfoRow label="Replay" value="denied" />
        </dl>
      </section>
      <details className="advancedDetails policyDetails">
        <summary>Advanced proof details</summary>
        <dl className="infoList">
          <InfoRow label="Token" value={asset.address} />
          <InfoRow label="Policy id" value="2" />
          <InfoRow label="PolicyEngine" value={config.engineAddress} />
          <InfoRow label="SettlementRouter" value={config.routerAddress} />
        </dl>
      </details>
    </section>
  );
}

function X402FlowPanel({
  activeAsset,
  busy,
  flow,
  merchantAudit,
  operatorKey,
  settlement,
  setOperatorKey,
  onExecute,
  onRequest,
  onSettle,
  onVerify,
}: {
  activeAsset: AssetSymbol;
  busy: string;
  flow: X402FlowState;
  merchantAudit: MerchantAuditRecord[];
  operatorKey: string;
  settlement: LiveSettlement | null;
  setOperatorKey: (value: string) => void;
  onExecute: () => void;
  onRequest: () => void;
  onSettle: () => void;
  onVerify: () => void;
}) {
  const latest = merchantAudit[0];
  const hasOperatorKey = operatorKey.trim().length > 0;
  const canSettle = Boolean(
    flow.paymentRequired && hasOperatorKey && activeAsset === "TSLA",
  );
  const amountLabel = flow.amount
    ? formatToken(flow.amount, activeAsset)
    : `0.25 ${activeAsset}`;
  const caseId = `OS-${activeAsset}-402-${
    flow.paymentId ? flow.paymentId.slice(-4).toUpperCase() : "PENDING"
  }`;
  const merchantImpact = settlement
    ? `${formatToken(settlement.before.merchantToken, activeAsset)} -> ${formatToken(
        settlement.after.merchantToken,
        activeAsset,
      )}`
    : `merchant receives ${amountLabel}`;
  const vaultImpact = settlement
    ? `${formatToken(settlement.before.routerVault, activeAsset)} -> ${formatToken(
        settlement.after.routerVault,
        activeAsset,
      )}`
    : `router vault debits ${amountLabel}`;
  const nextAction = !flow.paymentRequired
    ? {
        label: "Request clearance",
        detail: "Ask for protected market data and receive the expected 402.",
        action: onRequest,
        disabled: busy !== "",
        icon: <Radio size={17} />,
      }
    : !flow.verifyValid
      ? {
          label: "Verify clearance",
          detail: "Check merchant, token, amount, receipt, context and replay constraints.",
          action: onVerify,
          disabled: busy !== "",
          icon: <ShieldCheck size={17} />,
        }
      : !flow.txHash
        ? {
            label: "Clear And Settle",
            detail: hasOperatorKey
              ? "Operator clearance will move funds through the SettlementRouter."
              : "Enter the operator key before any funds can move.",
            action: onSettle,
            disabled: busy !== "" || !canSettle,
            icon: <PlayCircle size={17} />,
          }
        : {
            label: "Request New Clearance",
            detail: flow.unlocked
              ? "Receipt filed, data unlocked and replay denied. Run another request."
              : "Settlement proof exists; unlock is expected to complete on retry.",
            action: onRequest,
            disabled: busy !== "",
            icon: <Radio size={17} />,
          };
  const steps: Array<{
    label: string;
    detail: string;
    status: "done" | "active" | "pending";
    proof: string;
  }> = [
    {
      label: "Resource requested",
      detail: "Agent asks merchant for TSLA data.",
      status: flow.requestStatus ? "done" : "active",
      proof: flow.requestStatus ? "REQUESTED" : "NEXT",
    },
    {
      label: "402 issued",
      detail: "Merchant returns payment requirements.",
      status: flow.requestStatus === 402 ? "done" : "pending",
      proof: flow.requestStatus === 402 ? "PAYMENT REQUIRED" : "WAITING",
    },
    {
      label: "Policy verified",
      detail: "Osmium checks policy before funds move.",
      status: flow.verifyValid ? "done" : flow.paymentRequired ? "active" : "pending",
      proof: flow.verifyValid ? "CLEARED" : (flow.verifyStatus ?? "NOT VERIFIED"),
    },
    {
      label: "Operator clearance",
      detail: "Human checkpoint before funds move.",
      status: flow.verifyValid && !flow.txHash ? "active" : flow.txHash ? "done" : "pending",
      proof: flow.txHash ? "GRANTED" : hasOperatorKey ? "READY" : "OPERATOR KEY",
    },
    {
      label: "Settlement executed",
      detail: "SettlementRouter calls Stylus PolicyEngine.",
      status: flow.txHash ? "done" : "pending",
      proof: flow.txHash ? short(flow.txHash) : "NO TX",
    },
    {
      label: "Receipt filed",
      detail: "Merchant accepts receipt proof.",
      status: flow.unlocked ? "done" : flow.txHash ? "active" : "pending",
      proof: flow.unlocked ? "FILED" : "LOCKED",
    },
    {
      label: "Replay denied",
      detail: "Ledger remembers the paymentId.",
      status: flow.unlocked ? "done" : "pending",
      proof: latest?.unlocked ? "DENIED" : "WAITING",
    },
  ];

  return (
    <section className="judgePanel">
      <div className="panelHeader">
        <div>
          <span>Judge Mode</span>
          <strong>Clearance sequence</strong>
        </div>
        <StatusStamp tone={flow.unlocked ? "cleared" : "pending"}>
          {flow.unlocked ? "RECEIPT FILED" : "CLEARANCE PENDING"}
        </StatusStamp>
      </div>

      <section className="caseFile" aria-label="Active clearance case">
        <div>
          <span>Active case file</span>
          <strong>{caseId}</strong>
          <small>
            Agent request for paid market data. Funds stay locked until the
            case is cleared.
          </small>
        </div>
        <div className="caseDocket">
          <span>Agent</span>
          <strong>Market Data Agent</strong>
          <span>Merchant</span>
          <strong>Verified Market Data API</strong>
          <span>Asset</span>
          <strong>{activeAsset}</strong>
          <span>Amount</span>
          <strong>{amountLabel}</strong>
        </div>
      </section>

      <div className="judgeLead">
        <div>
          <span>Next action</span>
          <strong>{nextAction.label}</strong>
          <small>{nextAction.detail}</small>
        </div>
        {nextAction.label === "Clear And Settle" ? null : (
          <button
            className="primary"
            disabled={nextAction.disabled}
            onClick={nextAction.action}
            title={nextAction.label}
          >
            {nextAction.icon}
            {nextAction.label}
          </button>
        )}
      </div>

      <div className="clearanceDoctrine" aria-label="Clearance doctrine">
        <span>The agent asked.</span>
        <span>Osmium cleared.</span>
        <span>The router settled.</span>
        <span>The ledger remembered.</span>
      </div>

      <ProtocolRail flow={flow} />

      <div className="judgeTimeline">
        {steps.map((step, index) => (
          <div className={`judgeStep ${step.status}`} key={step.label}>
            <div className="stepIndex">{index + 1}</div>
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
            <em>{step.proof}</em>
          </div>
        ))}
      </div>

      <section className="approvalBox">
        <div className="approvalCopy">
          <span>Clearance packet</span>
          <strong>Review before funds move</strong>
          <small>
            The agent requested paid market data. Osmium requires policy
            clearance and an operator decision before settlement.
          </small>
        </div>
        <dl className="approvalFacts">
          <InfoRow label="Agent" value="Market Data Agent" />
          <InfoRow label="Action" value="Buy verified market data" />
          <InfoRow label="Merchant" value="Verified Market Data API" />
          <InfoRow label="Asset" value={activeAsset} />
          <InfoRow label="Amount" value={amountLabel} />
          <InfoRow
            label="Clearance check"
            value={flow.verifyValid ? "valid" : "not verified"}
          />
          <InfoRow label="Filed receipt" value="required" />
          <InfoRow label="Replay protection" value="enabled" />
        </dl>
        <div className="impactLedger" aria-label="Settlement impact">
          <div>
            <span>Router vault impact</span>
            <strong>{vaultImpact}</strong>
          </div>
          <div>
            <span>Merchant balance impact</span>
            <strong>{merchantImpact}</strong>
          </div>
          <div>
            <span>Receipt state</span>
            <strong>{flow.unlocked ? "filed + unlockable" : "required before unlock"}</strong>
          </div>
          <div>
            <span>Replay state</span>
            <strong>{latest?.unlocked ? "paymentId consumed" : "pending settlement"}</strong>
          </div>
        </div>
        <label className="x402Operator">
          <span>Session-only operator key</span>
          <input
            aria-label="Operator API key"
            disabled={busy !== ""}
            onChange={(event) => setOperatorKey(event.target.value)}
            placeholder="x-osmium-api-key"
            type="password"
            value={operatorKey}
          />
          <small>
            {hasOperatorKey
              ? "session-only key loaded"
              : "used only to authorize this clearance; never stored in frontend env"}
          </small>
        </label>
        <div className="approvalChecks" aria-label="Policy checks">
          <span>Merchant verified</span>
          <span>Token allowed</span>
          <span>Under limit</span>
          <span>Filed receipt</span>
          <span>Replay protected</span>
          <span>Context bound</span>
        </div>
        {flow.verifyValid && !flow.txHash ? (
          <button
            className="primary"
            disabled={busy !== "" || !canSettle}
            onClick={onSettle}
            title="Clear and settle through Osmium"
          >
            <PlayCircle size={16} />
            Clear and settle
          </button>
        ) : null}
      </section>

      <details className="advancedDetails">
        <summary>Advanced proof details</summary>
        <div className="x402Ledger">
          <InfoRow label="Protocol" value={flow.protocol ?? "pending"} />
          <InfoRow
            label="Scheme"
            value={flow.scheme ?? "osmium-exact"}
          />
          <InfoRow label="Network" value={flow.network ?? "eip155:46630"} />
          <InfoRow
            label="Token"
            value={flow.token ? short(flow.token) : "pending"}
          />
          <InfoRow
            label="Pay To"
            value={
              flow.paymentRequired
                ? short(flow.paymentRequired.accepts[0].payTo)
                : "SettlementRouter"
            }
          />
          <InfoRow
            label="Payment Id"
            value={flow.paymentId ? short(flow.paymentId) : "pending"}
          />
          <InfoRow
            label="Filed Receipt"
            value={flow.receiptHash ? short(flow.receiptHash) : "pending"}
          />
          <InfoRow
            label="Latest Unlock"
            value={latest?.unlocked ? short(latest.paymentId) : "none"}
          />
          <InfoRow label="Scope" value="custom facilitator, not CDP" />
        </div>
        <button
          disabled={busy !== "" || !hasOperatorKey || activeAsset !== "TSLA"}
          onClick={onExecute}
          title="Fallback to the classic live settlement endpoint"
        >
          <FileCheck2 size={16} />
          Router settlement fallback
        </button>
      </details>
    </section>
  );
}

function TopBadges({ runnerStatus }: { runnerStatus: string }) {
  return (
    <div className="topBadges" aria-label="Live deployment badges">
      <span>Robinhood Chain Testnet</span>
      <span>Custom x402 clearance rail</span>
      <span className={runnerStatus === "online" ? "online" : ""}>
        Runner {runnerStatus}
      </span>
    </div>
  );
}

function StatusStamp({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "cleared" | "pending" | "denied" | "protocol";
}) {
  return <div className={`statusStamp ${tone}`}>{children}</div>;
}

function ProtocolRail({ flow }: { flow: X402FlowState }) {
  const nodes = [
    {
      label: "Agent request",
      detail: "request",
      icon: <Database size={16} />,
      done: Boolean(flow.requestStatus),
    },
    {
      label: "402 Required",
      detail: flow.requestStatus === 402 ? "402" : "resource",
      icon: <Store size={16} />,
      done: flow.requestStatus === 402,
    },
    {
      label: "Osmium verify",
      detail: flow.verifyValid ? "verified" : "verify",
      icon: <ShieldCheck size={16} />,
      done: Boolean(flow.verifyValid),
    },
    {
      label: "Operator clearance",
      detail: flow.txHash ? "granted" : "human gate",
      icon: <KeyRound size={16} />,
      done: Boolean(flow.txHash),
    },
    {
      label: "Router settlement",
      detail: flow.txHash ? "transfer" : "vault locked",
      icon: <ArrowRightLeft size={16} />,
      done: Boolean(flow.txHash),
    },
    {
      label: "Merchant unlock",
      detail: flow.unlocked ? "200 OK" : "locked",
      icon: <FileCheck2 size={16} />,
      done: Boolean(flow.unlocked),
    },
  ];

  return (
    <div className="protocolRail" aria-label="x402-compatible payment rail">
      {nodes.map((node) => (
        <div className={node.done ? "protocolNode done" : "protocolNode"} key={node.label}>
          <div className="protocolIcon">{node.icon}</div>
          <strong>{node.label}</strong>
          <span>{node.detail}</span>
        </div>
      ))}
    </div>
  );
}

function MerchantPanel({
  activeAsset,
  quote,
  unlock,
  onQuote,
  busy,
}: {
  activeAsset: AssetSymbol;
  quote: MerchantQuote | null;
  unlock: MerchantUnlock | null;
  onQuote: () => void;
  busy: boolean;
}) {
  return (
    <section className="merchantGrid" id="merchants">
      <section className="panel merchantHero">
        <div className="panelHeader">
          <div>
            <span>Verified merchant</span>
            <strong>Verified Market Data API</strong>
          </div>
          <StatusStamp tone="cleared">VERIFIED</StatusStamp>
        </div>
        <p>
          Protected resource: <strong>/merchant/market-data</strong>. It returns
          402 until Osmium clears the request and files a receipt.
        </p>
        <button
          className="primary"
          onClick={onQuote}
          disabled={busy}
          title="Request protected merchant resource"
        >
          <Store size={17} />
          Request protected resource
        </button>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Protected resource</span>
            <strong>{quote?.title ?? `${activeAsset} market data snapshot`}</strong>
          </div>
          <CircleDollarSign size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="Resource" value="/merchant/market-data" />
          <InfoRow label="Live asset" value="TSLA" />
          <InfoRow label="Quote asset" value="AMD" />
          <InfoRow
            label="Price"
            value={quote ? `${quote.price} ${quote.asset}` : "0.25 TSLA"}
          />
          <InfoRow label="Protocol" value="x402-compatible Osmium" />
          <InfoRow
            label="Filed receipt"
            value={quote ? short(quote.receiptHash) : "required"}
          />
          <InfoRow label="Data" value={unlock?.unlocked ? "unlocked" : "locked"} />
        </dl>
      </section>
      <details className="advancedDetails merchantDetails">
        <summary>Advanced merchant proof</summary>
        <dl className="infoList">
          <InfoRow label="Merchant" value={quote?.merchant ?? "0x0000...beef"} />
          <InfoRow label="Token" value={quote?.token ?? assets[0].address} />
          <InfoRow label="Data hash" value={quote?.dataHash ?? "pending"} />
          <InfoRow label="Receipt hash" value={quote?.receiptHash ?? "pending"} />
        </dl>
      </details>
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
  onReplay,
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
    { label: "File latest receipt", state: "allow", action: onPay },
    { label: "Read proof ledger", state: "execute", action: onExecute },
    { label: "Deny unknown merchant", state: "block", action: onUnknown },
    { label: "Deny missing receipt", state: "block", action: onMissing },
    { label: "Deny over max", state: "block", action: onOver },
    { label: "Deny replay", state: "live", action: onReplay },
  ];

  return (
    <div className="scenarioRail" aria-label="Spend scenarios">
      {scenarios.map((scenario) => (
        <button
          className={`scenarioChip ${scenario.state}`}
          disabled={busy !== ""}
          key={scenario.label}
          onClick={scenario.action}
        >
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CommandStatusStrip({
  activeAsset,
  quote,
  runnerStatus,
  settlement,
}: {
  activeAsset: AssetSymbol;
  quote: MerchantQuote | null;
  runnerStatus: string;
  settlement: LiveSettlement | null;
}) {
  return (
    <section className="cockpitStatus" aria-label="Command center status">
      <StatusCard
        icon={<Database size={17} />}
        label="Agent"
        value="Ready"
        detail={runnerStatus === "online" ? "Ready" : "Waiting for runner"}
        tone={runnerStatus === "online" ? "ok" : "warn"}
      />
      <StatusCard
        icon={<ShieldCheck size={17} />}
        label="Policy"
        value="Armed"
        detail={`${activeAsset} ${activeAsset === "TSLA" ? "live" : "quote-supported"}`}
        tone="ok"
      />
      <StatusCard
        icon={<CircleDollarSign size={17} />}
        label="Vault"
        value="Funded"
        detail={
          settlement
            ? `${formatToken(settlement.after.routerVault)} router balance`
            : "SettlementRouter custody"
        }
        tone="ok"
      />
      <StatusCard
        icon={<Store size={17} />}
        label="Merchant"
        value="Verified"
        detail={quote?.title ?? "Market Data API"}
        tone="ok"
      />
    </section>
  );
}

function StatusCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone: "ok" | "warn" | "info";
  value: string;
}) {
  return (
    <div className={`statusCard ${tone}`}>
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function CockpitSummary({
  account,
  activeAsset,
  nativeBalance,
  quote,
  runnerStatus,
  settlement,
}: {
  account: string;
  activeAsset: AssetSymbol;
  nativeBalance: string;
  quote: MerchantQuote | null;
  runnerStatus: string;
  settlement: LiveSettlement | null;
}) {
  return (
    <section className="panel cockpitSummary">
      <div className="panelHeader">
        <div>
          <span>Control surface</span>
          <strong>Can this agent spend?</strong>
        </div>
        <StatusStamp tone="pending">CLEARANCE REQUIRED</StatusStamp>
      </div>
      <dl className="infoList">
        <InfoRow label="Agent" value="Market Data Agent" />
        <InfoRow label="Wallet" value={short(account)} />
        <InfoRow label="Gas" value={nativeBalance} />
        <InfoRow label="Runner" value={runnerStatus} />
        <InfoRow label="Active asset" value={activeAsset} />
        <InfoRow label="Merchant" value="Verified Market Data API" />
        <InfoRow
          label="Price"
          value={quote ? `${quote.price} ${quote.asset}` : "0.25 TSLA"}
        />
        <InfoRow
          label="Latest receipt"
          value={settlement ? short(settlement.receiptHash) : "none"}
        />
      </dl>
    </section>
  );
}

function AttemptRow({ item }: { item: DemoPreview }) {
  const ok = item.preview.allowed;
  return (
    <div className="attemptRow">
      <div className={ok ? "stateIcon ok" : "stateIcon blocked"}>
        {ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      </div>
      <div>
        <strong>{item.label}</strong>
        <span>{ok ? "Cleared by policy" : item.preview.reasonName}</span>
      </div>
      <code>{`reason ${item.preview.reason}`}</code>
    </div>
  );
}

function SettlementPanel({
  settlement,
}: {
  settlement: LiveSettlement | null;
}) {
  if (!settlement) {
    return (
      <section className="panel proofPanel">
        <div className="panelHeader">
          <div>
            <span>Proof Ledger</span>
            <strong>Awaiting filed receipt</strong>
          </div>
          <ArrowRightLeft size={20} />
        </div>
        <div className="emptyProof">
          <CircleDollarSign size={42} />
          <span>Run the clearance sequence to file the latest TSLA receipt.</span>
        </div>
      </section>
    );
  }

  const symbol = tokenSymbolFor(settlement.token);
  return (
    <section className="panel proofPanel">
      <div className="panelHeader">
        <div>
          <span>Proof Ledger</span>
          <strong>
            Policy {settlement.policyId} / {symbol}
          </strong>
        </div>
        <StatusStamp tone={settlement.replay.blocked ? "cleared" : "denied"}>
          {settlement.replay.blocked ? "REPLAY DENIED" : "REPLAY OPEN"}
        </StatusStamp>
      </div>

      <div className="ledger">
        <LedgerRow
          label="Amount"
          value={formatToken(settlement.amount, symbol)}
          detail="clearance amount"
        />
        <LedgerRow
          label="Merchant"
          value={formatToken(settlement.after.merchantToken, symbol)}
          detail={formatDelta(
            settlement.before.merchantToken,
            settlement.after.merchantToken,
            symbol,
          )}
        />
        <LedgerRow
          label="Router Vault"
          value={formatToken(settlement.after.routerVault, symbol)}
          detail={formatDelta(
            settlement.before.routerVault,
            settlement.after.routerVault,
            symbol,
          )}
        />
        <LedgerRow
          label="Payment Id"
          value={short(settlement.paymentId)}
          detail="anti-replay key"
        />
        <LedgerRow
          label="Filed Receipt"
          value={short(settlement.receiptHash)}
          detail="stored onchain"
        />
        <LedgerRow
          label="Context"
          value={short(settlement.contextHash)}
          detail="intent binding"
        />
      </div>

      {settlement.transactions.settle ? (
        <a
          className="txLink"
          href={txUrl(settlement.transactions.settle)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} />
          {short(settlement.transactions.settle)}
        </a>
      ) : null}
    </section>
  );
}

function AuditTrail({
  rows,
  merchantAudit,
}: {
  rows: Array<{ status: string; detail: string; ok: boolean }>;
  merchantAudit: MerchantAuditRecord[];
}) {
  return (
    <section className="panel auditPanel">
      <div className="panelHeader">
        <div>
          <span>Proof Ledger</span>
          <strong>{rows.length + merchantAudit.length} events</strong>
        </div>
        <FileCheck2 size={20} />
      </div>
      <div className="auditRows">
        {rows.length === 0 && merchantAudit.length === 0 ? (
          <div className="emptyAudit">No events yet</div>
        ) : (
          <>
            <div className="auditHeader">
              <span>Time</span>
              <span>Clearance Event</span>
              <span>Decision</span>
              <span>Proof</span>
            </div>
            {merchantAudit.map((record) => (
              <div className="auditRow" key={record.paymentId}>
                <div
                  className={
                    record.unlocked ? "stateIcon ok" : "stateIcon blocked"
                  }
                >
                  {record.unlocked ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <FileCheck2 size={18} />
                  )}
                </div>
                <strong>{formatAuditTime(record.timestamp)}</strong>
                <span>
                  {record.unlocked ? "DATA UNLOCKED" : "SETTLEMENT EXECUTED"} /{" "}
                  {formatToken(record.amount, record.asset)} / filed receipt{" "}
                  {short(record.receiptHash)}
                </span>
                {isFullTxHash(record.txHash) ? (
                  <a
                    className="auditTxLink"
                    href={txUrl(record.txHash)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink size={14} />
                    {short(record.txHash)}
                  </a>
                ) : (
                  <span className="auditTxMissing">local proof</span>
                )}
              </div>
            ))}
            {rows.map((row, index) => (
              <div className="auditRow" key={`${row.status}-${index}`}>
                <div className={row.ok ? "stateIcon ok" : "stateIcon blocked"}>
                  {row.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                </div>
                <strong>local</strong>
                <span>{row.detail}</span>
                <span className={row.ok ? "auditTxMissing cleared" : "auditTxMissing denied"}>
                  {row.status}
                </span>
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
    <section className="developerPanel docsPanel">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Developer Surface</span>
            <strong>Integrate clearance in 10 minutes</strong>
          </div>
          <Code2 size={20} />
        </div>
        <div className="developerGrid">
          <div className="setupList">
            <div>
              <ListChecks size={17} />
              <span>Request protected merchant resource</span>
            </div>
            <div>
              <ListChecks size={17} />
              <span>Verify clearance requirements</span>
            </div>
            <div>
              <ListChecks size={17} />
              <span>Ask operator to clear settlement</span>
            </div>
            <div>
              <ListChecks size={17} />
              <span>Unlock data with paymentId and filed receipt</span>
            </div>
          </div>
          <pre>
            <code>{`const challenge = await osmium.getMarketData("TSLA");
await osmium.verifyX402(challenge);

const settlement = await osmium.settleX402(challenge, {
  operatorApiKey
});

const data = await osmium.getMarketData("TSLA", {
  paymentId: settlement.paymentId,
  receiptHash: settlement.receiptHash
});`}</code>
          </pre>
        </div>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Endpoints</span>
            <strong>x402-compatible clearance API</strong>
          </div>
          <Radio size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="Resource" value="GET /merchant/market-data" />
          <InfoRow label="Verify" value="POST /x402/verify" />
          <InfoRow label="Clear + settle" value="POST /x402/settle" />
          <InfoRow label="Proof ledger" value="GET /merchant/audit" />
          <InfoRow label="Network" value="eip155:46630" />
          <InfoRow label="Assets" value="TSLA live / AMD quote-supported" />
        </dl>
      </section>
    </section>
  );
}

function SettingsPanel({ runnerStatus }: { runnerStatus: string }) {
  return (
    <section className="settingsGrid">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Live deployment</span>
            <strong>Robinhood Chain runtime</strong>
          </div>
          <Activity size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="Runner" value={runnerStatus} />
          <InfoRow label="Network" value="eip155:46630" />
          <InfoRow label="PolicyEngine" value={short(config.engineAddress)} />
          <InfoRow label="SettlementRouter" value={short(config.routerAddress)} />
          <InfoRow label="TSLA token" value={short(assets[0].address)} />
          <InfoRow label="AMD token" value={short(assets[1].address)} />
        </dl>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Limitations</span>
            <strong>Honest prototype boundaries</strong>
          </div>
          <AlertTriangle size={20} />
        </div>
        <div className="setupList">
          <div>
            <ListChecks size={17} />
            <span>Custom x402-compatible facilitator, not CDP facilitator.</span>
          </div>
          <div>
            <ListChecks size={17} />
            <span>Testnet prototype, not audited or production custody.</span>
          </div>
          <div>
            <ListChecks size={17} />
            <span>JSON-backed demo audit store; indexer is roadmap.</span>
          </div>
          <div>
            <ListChecks size={17} />
            <span>AMD is quote-supported; TSLA is the live settlement proof.</span>
          </div>
        </div>
      </section>
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

function LedgerRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="ledgerRow">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function buildAuditRows(
  demo: DemoPreview[],
  settlement: LiveSettlement | null,
  spendEvents: SpendEvent[],
) {
  return [
    ...spendEvents,
    ...(settlement
      ? [
          {
            status: "CLEARANCE GRANTED",
            detail: `SETTLEMENT EXECUTED / ${formatToken(settlement.amount)} / filed receipt ${short(settlement.receiptHash)}`,
            ok: true,
          },
          {
            status: settlement.replay.blocked ? "REPLAY DENIED" : "REPLAY OPEN",
            detail: settlement.replay.reasonName,
            ok: settlement.replay.blocked,
          },
        ]
      : []),
    ...demo.map((item) => ({
      status: item.preview.allowed ? "CLEARED" : "DENIED",
      detail: item.preview.allowed ? item.label : item.preview.reasonName,
      ok: item.preview.allowed,
    })),
  ];
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
