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
  resourceKind?: string;
  title: string;
  price: string;
  priceWei: string;
  token: string;
  merchant: string;
  serviceId: string;
  dataHash: string;
  receiptHash: string;
  receiptMode: string;
  receiptStandard?: string;
};

type MerchantUnlock = {
  asset: AssetSymbol;
  service: string;
  title?: string;
  unlocked: boolean;
  dataHash: string;
  merchantReceipt?: MerchantReceiptAttestation | null;
  payload: { symbol: string; snapshot: string; settlement: string } | null;
};

type MerchantReceiptAttestation = {
  standard: "EIP-712";
  primaryType: "MerchantReceipt";
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  message: {
    resourceId: string;
    responseHash: string;
    paymentId: string;
    settlementTxHash: string;
    expiresAt: string;
  };
  signer: string | null;
  expectedSigner: string | null;
  recoveredSigner: string | null;
  signature: string | null;
  verified: boolean;
  mode: "signed" | "unsigned-demo";
  note: string;
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
  merchantReceipt?: MerchantReceiptAttestation | null;
  paymentRequired?: X402PaymentRequired;
  paymentResponse?: string;
  unlocked?: boolean;
};

type MerchantAuditRecord = {
  paymentId: string;
  asset: AssetSymbol;
  receiptHash: string;
  service?: string;
  title?: string;
  responseHash?: string;
  merchantReceipt?: MerchantReceiptAttestation | null;
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
  {
    symbol: "AMZN",
    status: "supported",
    address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
    tone: "Corporate action service",
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
    eyebrow: "Operator console",
    title: "Run a safe agent payment",
    description:
      "Follow one AI finance agent as it requests paid data, passes policy checks, asks for approval, pays, and receives a signed receipt.",
  },
  policy: {
    eyebrow: "Payment policy",
    title: "TSLA Payment Policy",
    description:
      "The deterministic rules that decide whether an agent payment can move funds.",
  },
  merchant: {
    eyebrow: "Data service",
    title: "Verified Data Service",
    description:
      "The paid Robinhood agent service that stays locked until Osmium verifies payment.",
  },
  audit: {
    eyebrow: "Proof log",
    title: "Proof Log",
    description:
      "A readable record of payment attempts, signed receipts, blocked replays and tx proofs.",
  },
  developer: {
    eyebrow: "Developer guide",
    title: "Integrate safe agent payments",
    description:
      "Request a protected resource, verify policy, execute payment through Osmium, then unlock.",
  },
  settings: {
    eyebrow: "Settings",
    title: "Live Deployment",
    description:
      "Deployment details, supported network and honest prototype boundaries.",
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
      setError("Live payment is currently wired to TSLA. AMD and AMZN are quote-supported service examples.");
      return;
    }
    if (!operatorKey.trim()) {
      setError("Paste the Render RUNNER_API_KEY to approve and pay.");
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
      if (!result.success) throw new Error(result.errorMessage ?? "Payment approval failed.");
      if (result.settlement) setSettlement(result.settlement);
      const resource = await callRunnerRawGet(
        `/merchant/market-data?asset=TSLA&paymentId=${result.paymentId}&receiptHash=${result.receiptHash}`,
      );
      const unlocked = resource.body as MerchantUnlock;
      setUnlock(unlocked);
      await refreshMerchantAudit();
      setX402Flow((current) => ({
        ...current,
        unlockStatus: resource.status,
        paymentId: result.paymentId,
        receiptHash: result.receiptHash,
        txHash: result.transaction,
        merchantReceipt: unlocked.merchantReceipt ?? null,
        paymentResponse: resource.paymentResponse ?? undefined,
        unlocked: resource.status === 200,
      }));
      addSpendEvent({
        status: "Filed",
        detail: "SIGNED RECEIPT / x402-compatible TSLA market data",
        tx: result.transaction,
        receipt: result.receiptHash,
        ok: resource.status === 200,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment approval failed.");
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
        "Live payment is currently wired to TSLA. AMD and AMZN are quote-supported service examples.",
      );
      return;
    }
    if (!operatorKey.trim()) {
      setError("Paste the Render RUNNER_API_KEY to approve and pay.");
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
        merchantReceipt: unlocked.merchantReceipt ?? null,
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
          : "Live payment failed.",
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
    { id: "command", label: "Run Demo", icon: <PlayCircle size={17} /> },
    { id: "policy", label: "Policy", icon: <KeyRound size={17} /> },
    { id: "merchant", label: "Data Service", icon: <Store size={17} /> },
    { id: "audit", label: "Proof Log", icon: <FileCheck2 size={17} /> },
    { id: "developer", label: "Developers", icon: <Code2 size={17} /> },
    { id: "settings", label: "Settings", icon: <SlidersHorizontal size={17} /> },
  ];
  const riskWorkbench = (
    <section className="decisionDesk">
      <div className="panelHeader">
        <div>
          <span>Failure cases</span>
          <strong>Blocked payment examples</strong>
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
            title="Read latest payment proof"
          >
            <FileCheck2 size={17} />
              Latest proof
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
        <Kpi label="Allowed" value={String(allowed)} />
        <Kpi label="Blocked" value={String(blocked)} />
        <Kpi label="Requests" value={String(demo.length)} />
      </div>

      <div className="attempts">
        {demo.length === 0 ? (
          <div className="emptyState">
            <ShieldCheck size={42} />
            <span>
              Preview blocked scenarios after you understand the main payment flow.
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
            <strong>Agent Payments</strong>
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
        <header className={view === "command" ? "topbar commandTopbar" : "topbar"}>
          {view === "command" ? (
            <div className="commandTopline">
              <span className="eyebrow">Live operator console</span>
              <TopBadges runnerStatus={runnerStatus} />
            </div>
          ) : (
            <div>
              <span className="eyebrow">{currentView.eyebrow}</span>
              <h1>{currentView.title}</h1>
              <p>{currentView.description}</p>
              <TopBadges runnerStatus={runnerStatus} />
            </div>
          )}
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
            <section className="requestWorkspace">
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
              <CommandStatusStrip
                activeAsset={activeAsset}
                quote={quote}
                runnerStatus={runnerStatus}
                settlement={settlement}
              />
              <details className="productStoryDrawer">
                <summary>
                  <span>What Osmium does</span>
                  <strong>Why this payment cannot happen like a normal wallet transfer</strong>
                </summary>
                <ClearingHero
                  activeAsset={activeAsset}
                  busy={busy}
                  flow={x402Flow}
                  runnerStatus={runnerStatus}
                  settlement={settlement}
                  onRequest={() => requestMarketDataResource(activeAsset)}
                />
              </details>
              <details className="operatorSnapshot operatorDrawer">
                <summary>
                  <span>Technical context</span>
                  <strong>balances, agent and latest signed receipt</strong>
                </summary>
                <CockpitSummary
                  activeAsset={activeAsset}
                  account={account}
                  nativeBalance={nativeBalance}
                  quote={quote}
                  runnerStatus={runnerStatus}
                  settlement={settlement}
                />
                <SettlementPanel settlement={settlement} />
              </details>
            </section>
            <details className="liveContextDrawer">
              <summary>
                <span>Runtime context</span>
                <strong>Robinhood 46630 · TSLA live · protected payment rail</strong>
              </summary>
              <section className="clearingTape" aria-label="Live clearing tape">
                <span>RH-46630</span>
                <strong>OSMIUM AGENT PAYMENTS</strong>
                <span>SCHEME OSMIUM-EXACT</span>
                <span>ASSET TSLA LIVE</span>
                <span>RESOURCE MARKET-DATA</span>
                <span>HUMAN APPROVAL REQUIRED</span>
              </section>
            </details>
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
            <PageGuide
              eyebrow="After the demo runs"
              title="This is where the app proves what happened."
              description="The proof log is empty before a payment. After the live flow, it should show the transaction, signed merchant receipt, data unlock and replay protection."
              bullets={[
                "Tx hash links to the Robinhood explorer.",
                "Signed receipt shows the merchant attested to the response.",
                "Replay proof shows the same paymentId cannot be reused.",
              ]}
            />
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

function ClearingHero({
  activeAsset,
  busy,
  flow,
  runnerStatus,
  settlement,
  onRequest,
}: {
  activeAsset: AssetSymbol;
  busy: string;
  flow: X402FlowState;
  runnerStatus: string;
  settlement: LiveSettlement | null;
  onRequest: () => void;
}) {
  const liveTx = settlement?.transactions.settle;
  const heroState = flow.unlocked
    ? "RESOURCE UNLOCKED"
    : flow.txHash
      ? "PAYMENT PROOF READY"
      : flow.verifyValid
        ? "AWAITING APPROVAL"
        : flow.paymentRequired
          ? "402 ISSUED"
          : "READY";

  return (
    <section className="clearingHero" aria-label="Osmium product story">
      <div className="heroCopy">
        <span className="heroKicker">Safe payments for AI finance agents</span>
        <h2>Watch an AI agent pay safely.</h2>
        <p>
          This console runs one live testnet payment. The agent asks for TSLA
          data, Osmium checks the rules, you approve the spend, then the data
          unlocks with a signed receipt.
        </p>
        <div className="heroActions">
          <button
            className="primary"
            disabled={busy !== ""}
            onClick={onRequest}
            title="Start the protected market data request"
          >
            <Radio size={17} />
            1. Request paid data
          </button>
          {liveTx && isFullTxHash(liveTx) ? (
            <a className="glassLink" href={txUrl(liveTx)} rel="noreferrer" target="_blank">
              <ExternalLink size={15} />
              View latest tx proof
            </a>
          ) : (
            <span className="glassLink muted">Tx proof appears after payment</span>
          )}
        </div>
        <div className="operatorBrief">
          <strong>Your role</strong>
          <span>
            You are the operator. The agent never receives the private key; it
            can only request a payment that you approve after Osmium verifies
            the policy.
          </span>
        </div>
        <div className="heroClaims" aria-label="Product differentiators">
          <span>Request API</span>
          <strong>Check policy</strong>
          <span>Approve payment</span>
          <span>Signed receipt</span>
        </div>
      </div>

      <div className="heroVisual" aria-label="Clearing mechanism visual">
        <div className="liquidGlassPane">
          <div className="glassHeader">
            <span>SAFE AGENT PAYMENT</span>
            <ProofStamp tone={runnerStatus === "online" ? "cleared" : "pending"}>
              {runnerStatus}
            </ProofStamp>
          </div>
          <div className="liquidCore">
            <div className="liquidOrb" />
            <div className="stackLayer agent">
              <span>01</span>
              <strong>Agent asks for data</strong>
              <small>{activeAsset} market-data snapshot</small>
            </div>
            <div className="stackLayer policy">
              <span>02</span>
              <strong>Osmium checks policy</strong>
              <small>merchant / token / receipt / replay</small>
            </div>
            <div className="stackLayer router">
              <span>03</span>
              <strong>Payment executes</strong>
              <small>{settlement ? formatToken(settlement.amount, activeAsset) : "0.25 TSLA"} to verified merchant</small>
            </div>
          </div>
          <div className="heroProofStrip">
            <ProofStamp tone="protocol">402</ProofStamp>
            <ProofStamp tone={flow.verifyValid ? "cleared" : "protocol"}>POLICY</ProofStamp>
            <ProofStamp tone={flow.txHash ? "cleared" : "pending"}>CLEARANCE</ProofStamp>
            <ProofStamp tone={flow.unlocked ? "cleared" : "protocol"}>RECEIPT</ProofStamp>
            <ProofStamp tone={settlement?.replay.blocked ? "denied" : "protocol"}>REPLAY</ProofStamp>
          </div>
          <div className="heroStateLine">
            <span>Current state</span>
            <strong>{heroState}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function PolicyPanel({ activeAsset }: { activeAsset: AssetSymbol }) {
  const asset = assets.find((item) => item.symbol === activeAsset) ?? assets[0];
  return (
    <section className="policyGrid" id="policies">
      <section className="panel policyHero">
        <div className="panelHeader">
          <div>
            <span>Payment rules</span>
            <strong>{asset.symbol} Agent Payment Policy</strong>
          </div>
          <StatusStamp tone="cleared">ARMED</StatusStamp>
        </div>
        <p>
          This policy decides whether the agent is allowed to pay before any
          router funds can move.
        </p>
      </section>
      <PageGuide
        eyebrow="How to read this page"
        title="Policy is the rule gate before approval."
        description="The live demo only reveals the approval button after these rules pass. This is where a user sees why the agent cannot spend freely."
        bullets={[
          "The merchant must be verified.",
          "The payment must stay under the max spend.",
          "A signed receipt and replay protection are required.",
        ]}
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Scope</span>
            <strong>Supported assets</strong>
          </div>
          <CircleDollarSign size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="TSLA" value="live payment" />
          <InfoRow label="AMD" value="risk snapshot quote-supported" />
          <InfoRow label="AMZN" value="corporate-action alert quote-supported" />
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
          <InfoRow label="Funds move" value="only after router approval" />
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
          <InfoRow label="Signed receipt" value="required" />
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
  const isComplete = Boolean(flow.unlocked);
  const nextAction = !flow.paymentRequired
    ? {
        label: "Request paid data",
        detail: "Ask the merchant API for TSLA data. It should answer with 402 Payment Required.",
        action: onRequest,
        disabled: busy !== "",
        icon: <Radio size={17} />,
      }
    : !flow.verifyValid
      ? {
          label: "Check policy",
          detail: "Osmium checks merchant, token, amount, receipt, context and replay before funds can move.",
          action: onVerify,
          disabled: busy !== "",
          icon: <ShieldCheck size={17} />,
        }
      : !flow.txHash
        ? {
            label: "Approve and pay",
            detail: hasOperatorKey
              ? "Approving sends a real testnet TSLA payment through the SettlementRouter."
              : "Paste your Render RUNNER_API_KEY to approve this operator-only payment.",
            action: onSettle,
            disabled: busy !== "" || !canSettle,
            icon: <PlayCircle size={17} />,
          }
        : {
            label: "Payment complete",
            detail: flow.unlocked
              ? "Tx, signed receipt and data unlock are complete. Review the proof log or run again."
              : "Payment proof exists; retry unlock if the merchant data is still locked.",
            action: onRequest,
            disabled: busy !== "",
            icon: <Radio size={17} />,
          };
  const decision =
    flow.unlocked ? "DATA UNLOCKED" : flow.verifyValid ? "WAITING FOR APPROVAL" : "READY";
  const ticketTone = flow.unlocked ? "cleared" : flow.verifyValid ? "pending" : "queued";
  const steps: Array<{
    label: string;
    code: string;
    status: "done" | "active" | "pending";
    proof: string;
  }> = [
    {
      label: "REQUEST",
      code: "resource",
      status: flow.requestStatus ? "done" : "active",
      proof: flow.requestStatus ? "REQUESTED" : "NEXT",
    },
    {
      label: "402",
      code: "issued",
      status: flow.requestStatus === 402 ? "done" : "pending",
      proof: flow.requestStatus === 402 ? "PAYMENT REQUIRED" : "WAITING",
    },
    {
      label: "VERIFY",
      code: "policy",
      status: flow.verifyValid ? "done" : flow.paymentRequired ? "active" : "pending",
      proof: flow.verifyValid ? "VALID" : (flow.verifyStatus ?? "NOT VERIFIED"),
    },
    {
      label: "APPROVE",
      code: "operator",
      status: flow.verifyValid && !flow.txHash ? "active" : flow.txHash ? "done" : "pending",
      proof: flow.txHash ? "APPROVED" : hasOperatorKey ? "READY" : "OPERATOR KEY",
    },
    {
      label: "SETTLE",
      code: "router",
      status: flow.txHash ? "done" : "pending",
      proof: flow.txHash ? short(flow.txHash) : "NO TX",
    },
    {
      label: "RECEIPT",
      code: "signed",
      status: flow.unlocked ? "done" : flow.txHash ? "active" : "pending",
      proof: flow.unlocked ? "SIGNED" : "LOCKED",
    },
    {
      label: "DATA",
      code: "unlock",
      status: flow.unlocked ? "done" : "pending",
      proof: latest?.unlocked ? "UNLOCKED" : "WAITING",
    },
  ];

  return (
    <section className="judgePanel" id="payment-walkthrough">
      <div className="panelHeader">
        <div>
          <span>Start here</span>
          <strong>Run the live agent payment</strong>
        </div>
        <StatusStamp tone={flow.unlocked ? "cleared" : "pending"}>
          {flow.unlocked ? "DATA UNLOCKED" : flow.verifyValid ? "APPROVAL NEEDED" : "READY"}
        </StatusStamp>
      </div>

      <section className={`workflowDock ${isComplete ? "complete" : ""}`}>
        <div className="workflowBrief">
          <span>Current instruction</span>
          <strong>{nextAction.label}</strong>
          <small>{nextAction.detail}</small>
        </div>
        <div className="workflowAction">
          {flow.verifyValid && !flow.txHash ? (
            <>
              <label className="dockKeyField">
                <span>Paste Render RUNNER_API_KEY</span>
                <input
                  aria-label="Operator API key"
                  disabled={busy !== ""}
                  onChange={(event) => setOperatorKey(event.target.value)}
                  placeholder="une_clé_longue_random"
                  type="password"
                  value={operatorKey}
                />
              </label>
              <button
                className="primary"
                disabled={busy !== "" || !canSettle}
                onClick={onSettle}
                title="Approve and pay through Osmium"
              >
                <PlayCircle size={16} />
                Approve and pay 0.25 TSLA
              </button>
            </>
          ) : isComplete ? (
            <>
              <a className="glassLink" href="#audit">
                <FileCheck2 size={15} />
                View proof log
              </a>
              <button
                disabled={busy !== ""}
                onClick={onRequest}
                title="Start another paid data request"
              >
                <Radio size={17} />
                Run again
              </button>
            </>
          ) : (
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
      </section>

      <section className="sequencePanel">
        <div className="sequencePanelHeader">
          <span>Payment workflow</span>
          <strong>{"Request data -> 402 -> policy check -> operator approval -> payment -> signed receipt"}</strong>
        </div>
        <ClearingRail steps={steps} />
      </section>

      <details className="requestDetails" open={Boolean(flow.paymentRequired) && !isComplete}>
        <summary>
          <span>Payment request details</span>
          <strong>Agent, merchant, amount and protection</strong>
        </summary>
        <section className={`clearanceTicket ${ticketTone}`} aria-label="Clearance ticket">
          <div className="ticketSeal" aria-hidden="true">
            <span>NO BLANK</span>
            <strong>CHECK</strong>
          </div>
          <div className="ticketSpine">
            <span>OSMIUM</span>
            <strong>PAYMENT CHECK</strong>
          </div>
          <div className="ticketBody">
            <div className="ticketTop">
              <div>
                <span>Payment request</span>
                <strong>Market Data Agent wants TSLA data</strong>
                <small>Osmium will not let the agent pay until policy and operator approval pass.</small>
              </div>
              <ProofStamp tone={flow.unlocked ? "cleared" : "pending"}>
                {decision}
              </ProofStamp>
            </div>
            <div className="ticketFacts">
              <InfoRow label="Request id" value={caseId} />
              <InfoRow label="Agent wants" value="TSLA market data" />
              <InfoRow label="Merchant" value="Verified Market Data API" />
              <InfoRow label="Cost" value={amountLabel} />
              <InfoRow label="Protection" value="policy + operator approval" />
              <InfoRow label="Do next" value={nextAction.label} />
            </div>
          </div>
        </section>
      </details>

      {flow.verifyValid && !flow.txHash ? (
      <details className="approvalBox" open>
        <summary className="approvalSummary">
          <div className="approvalCopy">
            <span>Approval step</span>
            <strong>
              {flow.verifyValid && !flow.txHash
                ? "Approve a real testnet payment"
                : "Hidden until policy verifies"}
            </strong>
            <small>
              This is the only step that can move funds. It calls the protected
              Render runner endpoint with your operator key.
            </small>
          </div>
          <ProofStamp tone={flow.verifyValid ? "pending" : "protocol"}>
            {flow.verifyValid ? "READY" : "LOCKED"}
          </ProofStamp>
        </summary>
        <div className="approvalSeal" aria-hidden="true">
          OPERATOR APPROVAL
        </div>
        <dl className="approvalFacts">
          <InfoRow label="Agent" value="Market Data Agent" />
          <InfoRow label="Agent wants" value="Buy TSLA market data" />
          <InfoRow label="Merchant" value="Verified Market Data API" />
          <InfoRow label="Asset" value={activeAsset} />
          <InfoRow label="Amount" value={amountLabel} />
          <InfoRow
            label="Policy check"
            value={flow.verifyValid ? "valid" : "not verified"}
          />
          <InfoRow label="Signed receipt" value="required after payment" />
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
        <div className="approvalChecks" aria-label="Policy checks">
          <ProofStamp tone="cleared">Merchant verified</ProofStamp>
          <ProofStamp tone="cleared">Token allowed</ProofStamp>
          <ProofStamp tone="cleared">Under limit</ProofStamp>
          <ProofStamp tone="cleared">Filed receipt</ProofStamp>
          <ProofStamp tone="cleared">Replay protected</ProofStamp>
          <ProofStamp tone="cleared">Context bound</ProofStamp>
        </div>
      </details>
      ) : null}

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
            label="Signed receipt"
            value={flow.receiptHash ? short(flow.receiptHash) : "pending"}
          />
          <InfoRow
            label="Merchant Receipt"
            value={
              flow.merchantReceipt?.verified
                ? `signed + verified ${short(flow.merchantReceipt.signature ?? "")}`
                : flow.merchantReceipt?.signature
                  ? `signed / unverified ${short(flow.merchantReceipt.signature)}`
                : flow.merchantReceipt
                  ? "typed data returned"
                  : "pending"
            }
          />
          <InfoRow
            label="Recovered signer"
            value={
              flow.merchantReceipt?.recoveredSigner
                ? short(flow.merchantReceipt.recoveredSigner)
                : "pending"
            }
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
          title="Advanced fallback to the classic live settlement endpoint"
        >
          <FileCheck2 size={16} />
          Advanced: router fallback
        </button>
      </details>
    </section>
  );
}

function TopBadges({ runnerStatus }: { runnerStatus: string }) {
  return (
    <div className="topBadges" aria-label="Live deployment badges">
      <span>Robinhood Chain Testnet</span>
      <span>Policy-gated payment rail</span>
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

function ProofStamp({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "cleared" | "pending" | "denied" | "protocol";
}) {
  return <span className={`proofStamp ${tone}`}>{children}</span>;
}

function ClearingRail({
  steps,
}: {
  steps: Array<{
    label: string;
    code: string;
    status: "done" | "active" | "pending";
    proof: string;
  }>;
}) {
  const toneFor = (status: "done" | "active" | "pending") =>
    status === "done" ? "cleared" : status === "active" ? "pending" : "protocol";

  return (
    <div className="clearingRail" aria-label="Clearing rail">
      {steps.map((step, index) => (
        <div className={`railStation ${step.status}`} key={step.label}>
          <div className="stationMarker">{String(index + 1).padStart(2, "0")}</div>
          <strong>{step.label}</strong>
          <span>{step.code}</span>
          <ProofStamp tone={toneFor(step.status)}>{step.proof}</ProofStamp>
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
          402 until Osmium verifies payment and returns a signed receipt.
        </p>
        <div className="heroActions">
          <button
            className="primary"
            onClick={onQuote}
            disabled={busy}
            title="Request protected merchant resource"
          >
            <Store size={17} />
            Preview service quote
          </button>
          <a className="glassLink" href="#command">
            <PlayCircle size={15} />
            Run live payment
          </a>
        </div>
      </section>
      <PageGuide
        eyebrow="What the agent buys"
        title="The merchant is a paid data API, not a wallet recipient."
        description="This page explains the resource Osmium protects. In the demo, the agent requests TSLA market data, receives HTTP 402, then unlocks the response after payment proof."
        bullets={[
          "TSLA is the live paid resource.",
          "AMD and AMZN show the same service model for other Robinhood assets.",
          "The response unlocks only with paymentId plus signed receipt.",
        ]}
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Agent services pack</span>
            <strong>{quote?.title ?? `${activeAsset} market data snapshot`}</strong>
          </div>
          <CircleDollarSign size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="Live resource" value="TSLA market data" />
          <InfoRow label="Agent service" value={quote?.service ?? "market_data_snapshot"} />
          <InfoRow label="Quote pack" value="AMD risk / AMZN corporate action" />
          <InfoRow
            label="Price"
            value={quote ? `${quote.price} ${quote.asset}` : "0.25 TSLA"}
          />
          <InfoRow label="Protocol" value="x402-compatible Osmium" />
          <InfoRow
            label="Merchant receipt"
            value={
              unlock?.merchantReceipt?.verified
                ? "EIP-712 signed + verified"
                : unlock?.merchantReceipt?.signature
                  ? "EIP-712 signed / unverified"
                  : "EIP-712 typed data"
            }
          />
          <InfoRow
            label="Filed receipt"
            value={quote ? short(quote.receiptHash) : "required"}
          />
          <InfoRow label="Data" value={unlock?.unlocked ? "unlocked" : "locked"} />
        </dl>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Robinhood agent services</span>
            <strong>One merchant, three paid resources</strong>
          </div>
          <Layers3 size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="TSLA" value="market-data snapshot / live payment" />
          <InfoRow label="AMD" value="risk snapshot / quote-supported" />
          <InfoRow label="AMZN" value="corporate-action alert / quote-supported" />
        </dl>
      </section>
      <details className="advancedDetails merchantDetails">
        <summary>Advanced merchant proof</summary>
        <dl className="infoList">
          <InfoRow label="Merchant" value={quote?.merchant ?? "0x0000...beef"} />
          <InfoRow label="Token" value={quote?.token ?? assets[0].address} />
          <InfoRow label="Data hash" value={quote?.dataHash ?? "pending"} />
          <InfoRow label="Receipt hash" value={quote?.receiptHash ?? "pending"} />
          <InfoRow
            label="Expected signer"
            value={unlock?.merchantReceipt?.expectedSigner ? short(unlock.merchantReceipt.expectedSigner) : "configure MERCHANT_RECEIPT_SIGNER_PRIVATE_KEY"}
          />
          <InfoRow
            label="Recovered signer"
            value={unlock?.merchantReceipt?.recoveredSigner ? short(unlock.merchantReceipt.recoveredSigner) : "pending"}
          />
          <InfoRow
            label="Merchant signature"
            value={unlock?.merchantReceipt?.signature ? short(unlock.merchantReceipt.signature) : "typed data pending"}
          />
          <InfoRow
            label="Signature verified"
            value={unlock?.merchantReceipt?.verified ? "true" : "false / pending"}
          />
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
    { label: "Unlock with latest proof", state: "allow", action: onPay },
    { label: "Read latest payment proof", state: "execute", action: onExecute },
    { label: "Block unknown merchant", state: "block", action: onUnknown },
    { label: "Block missing receipt", state: "block", action: onMissing },
    { label: "Block over-limit payment", state: "block", action: onOver },
    { label: "Block replay", state: "live", action: onReplay },
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
    <section className="cockpitStatus" aria-label="Operator status">
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
            : "router holds funds"
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
          <span>Operator summary</span>
          <strong>What is live right now?</strong>
        </div>
        <StatusStamp tone="pending">APPROVAL REQUIRED</StatusStamp>
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
        <span>{ok ? "Allowed by policy" : item.preview.reasonName}</span>
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
            <span>Payment proof</span>
            <strong>No payment proof yet</strong>
          </div>
          <ArrowRightLeft size={20} />
        </div>
        <div className="emptyProof">
          <CircleDollarSign size={42} />
          <span>Run the guided payment to create a tx, signed receipt and replay proof.</span>
        </div>
      </section>
    );
  }

  const symbol = tokenSymbolFor(settlement.token);
  return (
    <section className="panel proofPanel">
      <div className="panelHeader">
        <div>
          <span>Payment proof</span>
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
          detail="approved amount"
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
          label="Router vault"
          value={formatToken(settlement.after.routerVault, symbol)}
          detail={formatDelta(
            settlement.before.routerVault,
            settlement.after.routerVault,
            symbol,
          )}
        />
        <LedgerRow
          label="Payment id"
          value={short(settlement.paymentId)}
          detail="anti-replay key"
        />
        <LedgerRow
          label="Signed receipt"
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
          <span>Proof log</span>
          <strong>{rows.length + merchantAudit.length} events</strong>
        </div>
        <FileCheck2 size={20} />
      </div>
      <div className="auditRows">
        {rows.length === 0 && merchantAudit.length === 0 ? (
          <div className="emptyAudit">
            <strong>No proof yet</strong>
            <span>Run the payment demo first. This log will then show tx proof, signed receipt, unlock and replay block.</span>
            <a className="glassLink" href="#command">
              <PlayCircle size={15} />
              Run Demo
            </a>
          </div>
        ) : (
          <>
            <div className="auditHeader">
              <span>Time</span>
              <span>Event</span>
              <span>Decision</span>
              <span>Proof</span>
            </div>
            {merchantAudit.map((record) => (
              <div className="ledgerEntry" key={record.paymentId}>
                <strong>{formatAuditTime(record.timestamp)}</strong>
                <span>
                  {record.unlocked ? "DATA UNLOCKED" : "SETTLEMENT EXECUTED"} /{" "}
                  {record.title ?? record.service ?? "agent service"} /{" "}
                  {formatToken(record.amount, record.asset)} /{" "}
                  {record.merchantReceipt?.verified
                    ? "merchant-signed receipt verified"
                    : record.merchantReceipt?.signature
                      ? "merchant-signed receipt unverified"
                    : `signed receipt ${short(record.receiptHash)}`}
                </span>
                <ProofStamp tone={record.unlocked ? "cleared" : "protocol"}>
                  {record.merchantReceipt?.verified ? "SIGNED" : record.unlocked ? "UNLOCKED" : "PAID"}
                </ProofStamp>
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
              <div className="ledgerEntry" key={`${row.status}-${index}`}>
                <strong>local</strong>
                <span>{row.detail}</span>
                <ProofStamp tone={row.ok ? "cleared" : "denied"}>
                  {row.status}
                </ProofStamp>
                <span className="auditTxMissing">local proof</span>
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
      <PageGuide
        eyebrow="Developer mental model"
        title="Treat Osmium as the approval layer between agent intent and payment."
        description="Your agent requests a protected resource. Osmium verifies the payment policy, routes the operator-approved payment, and returns proof the merchant can verify."
        bullets={[
          "Resource request returns a payment challenge.",
          "Policy verification is separate from payment execution.",
          "Operator approval is required before funds move.",
        ]}
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Integration guide</span>
            <strong>Integrate safe agent payments in 10 minutes</strong>
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
              <span>Check payment policy</span>
            </div>
            <div>
              <ListChecks size={17} />
              <span>Ask operator to approve payment</span>
            </div>
            <div>
              <ListChecks size={17} />
              <span>Unlock data with paymentId and signed receipt</span>
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
            <strong>x402-compatible payment API</strong>
          </div>
          <Radio size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="Resource" value="GET /merchant/market-data" />
          <InfoRow label="Verify" value="POST /x402/verify" />
          <InfoRow label="Approve + pay" value="POST /x402/settle" />
          <InfoRow label="Proof log" value="GET /merchant/audit" />
          <InfoRow label="Network" value="eip155:46630" />
          <InfoRow label="Assets" value="TSLA live / AMD risk / AMZN corporate action" />
        </dl>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Judge proof matrix</span>
            <strong>What the live policy proves</strong>
          </div>
          <ShieldCheck size={20} />
        </div>
        <dl className="infoList">
          <InfoRow label="Verified merchant + receipt" value="pays through router" />
          <InfoRow label="Replay paymentId" value="denied by PolicyEngine" />
          <InfoRow label="Unknown merchant" value="denied before funds move" />
          <InfoRow label="Missing receipt" value="denied by receipt gate" />
          <InfoRow label="Over max amount" value="denied by spend limit" />
          <InfoRow label="Context mismatch" value="denied by intent binding" />
        </dl>
      </section>
    </section>
  );
}

function SettingsPanel({ runnerStatus }: { runnerStatus: string }) {
  return (
    <section className="settingsGrid">
      <PageGuide
        eyebrow="Deployment map"
        title="What is live, and what is intentionally demo-grade."
        description="This page is for judges and operators who want to verify the network, contracts, runner and limits without reading the repository."
        bullets={[
          "Robinhood Chain testnet is the live network.",
          "PolicyEngine and SettlementRouter are deployed contracts.",
          "The audit store is demo-persistent, not a production indexer.",
        ]}
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Runtime registry</span>
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
          <InfoRow label="AMZN token" value={short(assets[2].address)} />
        </dl>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <span>Boundaries</span>
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
            <span>TSLA is live payment; AMD and AMZN are quote-supported service proofs.</span>
          </div>
        </div>
      </section>
    </section>
  );
}

function PageGuide({
  bullets,
  description,
  eyebrow,
  title,
}: {
  bullets: string[];
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="pageGuide">
      <div>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <ol>
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ol>
      <a className="glassLink" href="#command">
        <PlayCircle size={15} />
        Run the live payment
      </a>
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
            status: "PAYMENT APPROVED",
            detail: `PAYMENT EXECUTED / ${formatToken(settlement.amount)} / signed receipt ${short(settlement.receiptHash)}`,
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
