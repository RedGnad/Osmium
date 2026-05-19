import {
  StrictMode,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Wallet,
  X,
} from "lucide-react";
import { createPublicClient, formatEther, http, type Address } from "viem";
import "./styles.css";

/* ──────────────────────────────────────────────────────────────────────────
   Types — preserved as-is from the runner contract
   ──────────────────────────────────────────────────────────────────────── */

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
  before: { merchantToken: string; routerVault: string };
  transactions: {
    approve?: string;
    deposit?: string;
    settle: string;
    settleBlock: string;
  };
  replay: { blocked: boolean; reason: number; reasonName: string };
  after: { merchantToken: string; routerVault: string };
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
    resource: { url: string; description: string; mimeType: string };
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
      compatibility?: {
        upstream: "exact-on-permit2";
        divergence: "delegated-vault-settlement";
        reason: string;
      };
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

/* ──────────────────────────────────────────────────────────────────────────
   Config + assets — unchanged
   ──────────────────────────────────────────────────────────────────────── */

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

type ConsoleView = "clear" | "prove" | "build";

const hashFor: Record<ConsoleView, string> = {
  clear: "clear",
  prove: "prove",
  build: "build",
};

const legacyHashAlias: Record<string, ConsoleView> = {
  command: "clear",
  audit: "prove",
  developer: "build",
  policy: "clear",
  merchant: "clear",
  settings: "build",
};

function getInitialView(): ConsoleView {
  if (typeof window === "undefined") return "clear";
  const raw = window.location.hash.replace("#", "");
  if (raw === "clear" || raw === "prove" || raw === "build") return raw;
  if (raw in legacyHashAlias) return legacyHashAlias[raw];
  return "clear";
}

const robinhoodTestnet = {
  id: config.chainId,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────── */

function short(value: string) {
  if (!value || value === "not connected") return value || "—";
  if (value === "0x0000000000000000000000000000000000000000") return "unset";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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

function formatLedgerTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function txUrl(hash: string) {
  return `${config.explorerUrl}/tx/${hash}`;
}

function isFullTxHash(hash: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

function tokenSymbolFor(address: string) {
  return (
    assets.find((a) => a.address.toLowerCase() === address.toLowerCase())
      ?.symbol ?? "TSLA"
  );
}

async function callRunner(path: string, body?: unknown, apiKey?: string) {
  const isGet =
    path === "/health" ||
    path.startsWith("/merchant/quote") ||
    path === "/merchant/audit";
  const headers: Record<string, string> = { "content-type": "application/json" };
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
  if (!accepted)
    throw new Error("Request market data first to receive PAYMENT-REQUIRED.");
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

/* ──────────────────────────────────────────────────────────────────────────
   App
   ──────────────────────────────────────────────────────────────────────── */

function App() {
  const [account, setAccount] = useState<string>("not connected");
  const [nativeBalance, setNativeBalance] = useState<string>("--");
  const [runnerStatus, setRunnerStatus] = useState<
    "unknown" | "online" | "offline"
  >("unknown");
  const [activeAsset] = useState<AssetSymbol>("TSLA");
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

  async function refreshMerchantAudit() {
    setMerchantAudit(
      (await callRunner("/merchant/audit")) as MerchantAuditRecord[],
    );
  }

  function addSpendEvent(event: SpendEvent) {
    setSpendEvents((events) => [event, ...events].slice(0, 12));
  }

  function selectView(nextView: ConsoleView) {
    setView(nextView);
    window.history.replaceState(null, "", `#${hashFor[nextView]}`);
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
          : result.invalidReason ?? "invalid",
        verifyValid: result.isValid,
      }));
      if (!result.isValid)
        setError(result.invalidMessage ?? "x402 verification failed.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "x402 verification failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function settleX402Flow() {
    setError("");
    if (activeAsset !== "TSLA") {
      setError(
        "Live settlement is currently wired to TSLA. AMD and AMZN are quote-supported service examples.",
      );
      return;
    }
    if (!operatorKey.trim()) {
      setError(
        "Paste the operator key to clear and settle this protected payment.",
      );
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
      if (!result.success)
        throw new Error(result.errorMessage ?? "Settlement failed.");
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
        detail: `${unlocked.title ?? "TSLA market data"} unlocked with filed receipt`,
        tx: result.transaction,
        receipt: result.receiptHash,
        ok: resource.status === 200,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement failed.");
    } finally {
      setBusy("");
    }
  }

  function denyRequest() {
    setError("");
    addSpendEvent({
      status: "Denied",
      detail: "Operator declined to clear request",
      reason: "operator_denied",
      ok: false,
    });
    setX402Flow({});
    setUnlock(null);
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
        err instanceof Error
          ? err.message
          : "Denial scenario preview failed.",
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
        detail: `Replay attempt on paymentId ${short(proof.paymentId)}`,
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
    async function hydrate() {
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
        /* runner sleeping */
      }
      try {
        const proof = (await callRunner(
          "/demo/live-settlement/preview",
        )) as LiveSettlement;
        if (mounted) setSettlement(proof);
      } catch {
        /* preview optional */
      }
      try {
        const audit = (await callRunner(
          "/merchant/audit",
        )) as MerchantAuditRecord[];
        if (mounted) setMerchantAudit(audit);
      } catch {
        /* audit optional */
      }
    }
    void hydrate();
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

  const navItems: Array<{ id: ConsoleView; label: string }> = [
    { id: "clear", label: "Clear" },
    { id: "prove", label: "Prove" },
    { id: "build", label: "Build" },
  ];

  const ledgerCount = useMemo(
    () =>
      merchantAudit.length +
      spendEvents.length +
      (settlement?.replay ? 1 : 0) +
      demo.length,
    [merchantAudit, spendEvents, settlement, demo],
  );

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">O</div>
          <div className="brandText">
            <strong>Osmium</strong>
            <span>Clearing House</span>
          </div>
        </div>

        <nav className="primaryNav" aria-label="Console sections">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => selectView(item.id)}
              type="button"
            >
              {item.label}
              {item.id === "prove" && ledgerCount > 0 ? (
                <span className="navCount">
                  {String(ledgerCount).padStart(2, "0")}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="topbarSpacer" />

        <div className="topbarMeta">
          <span className={`runnerDot ${runnerStatus}`}>
            {runnerStatus === "online"
              ? "Runner online"
              : runnerStatus === "offline"
                ? "Runner offline"
                : "Runner ?"}
          </span>
          <button
            className="walletButton"
            onClick={connectWallet}
            title="Connect wallet"
          >
            <Wallet size={13} />
            <span>{short(account)}</span>
          </button>
        </div>
      </header>

      <TickerBar
        runnerStatus={runnerStatus}
        nativeBalance={nativeBalance}
        merchantTitle={quote?.title}
      />

      <section className="workspace">
        {error ? <div className="errorBar">{error}</div> : null}

        {view === "clear" ? (
          <ClearView
            activeAsset={activeAsset}
            busy={busy}
            flow={x402Flow}
            merchantAudit={merchantAudit}
            operatorKey={operatorKey}
            settlement={settlement}
            unlock={unlock}
            quote={quote}
            runnerStatus={runnerStatus}
            onClearKey={() => setOperatorKey("")}
            onDeny={denyRequest}
            onRequest={() => requestMarketDataResource(activeAsset)}
            onSettle={settleX402Flow}
            onSetOperatorKey={setOperatorKey}
            onVerify={verifyX402Flow}
            onPreviewBlocked={previewBlockedScenario}
            onReplay={replayLastPayment}
          />
        ) : null}

        {view === "prove" ? (
          <ProveView
            demo={demo}
            merchantAudit={merchantAudit}
            settlement={settlement}
            spendEvents={spendEvents}
            unlock={unlock}
          />
        ) : null}

        {view === "build" ? <BuildView /> : null}
      </section>
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Ticker
   ──────────────────────────────────────────────────────────────────────── */

function TickerBar({
  runnerStatus,
  nativeBalance,
  merchantTitle,
}: {
  runnerStatus: string;
  nativeBalance: string;
  merchantTitle?: string;
}) {
  return (
    <div className="ticker" aria-label="Network and facilitator ticker">
      <span className="tickerCell">
        <span className="tickerLabel">Network</span>
        <strong>eip155:46630</strong>
      </span>
      <span className="tickerCell">
        <span className="tickerLabel">Chain</span>
        <strong>Robinhood Chain Testnet</strong>
      </span>
      <span className="tickerCell">
        <span className="tickerLabel">Scheme</span>
        <strong>osmium-exact</strong>
      </span>
      <span className="tickerCell">
        <span className="tickerLabel">Facilitator</span>
        <strong>x402-compatible · custom</strong>
      </span>
      <span className="tickerCell">
        <span className="tickerLabel">Merchant</span>
        <strong>{merchantTitle ?? "Verified Market Data API"}</strong>
      </span>
      <span className="tickerSpacer" />
      <span className="tickerCell right">
        <span className="pip" />
        <span className="tickerLabel">Operator gas</span>
        <strong>{nativeBalance}</strong>
      </span>
      <span className="tickerCell right">
        <span className="tickerLabel">Runner</span>
        <strong>{runnerStatus}</strong>
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   ClearView — the hero screen
   ──────────────────────────────────────────────────────────────────────── */

function ClearView({
  activeAsset,
  busy,
  flow,
  merchantAudit,
  operatorKey,
  settlement,
  unlock,
  quote,
  runnerStatus,
  onClearKey,
  onDeny,
  onRequest,
  onSetOperatorKey,
  onSettle,
  onVerify,
  onPreviewBlocked,
  onReplay,
}: {
  activeAsset: AssetSymbol;
  busy: string;
  flow: X402FlowState;
  merchantAudit: MerchantAuditRecord[];
  operatorKey: string;
  settlement: LiveSettlement | null;
  unlock: MerchantUnlock | null;
  quote: MerchantQuote | null;
  runnerStatus: string;
  onClearKey: () => void;
  onDeny: () => void;
  onRequest: () => void;
  onSetOperatorKey: (v: string) => void;
  onSettle: () => void;
  onVerify: () => void;
  onPreviewBlocked: (k: "unknown" | "missing" | "over") => void;
  onReplay: () => void;
}) {
  const hasOperatorKey = operatorKey.trim().length > 0;
  const canSettle = Boolean(
    flow.paymentRequired && hasOperatorKey && activeAsset === "TSLA",
  );

  const amountLabel = flow.amount
    ? formatToken(flow.amount, activeAsset)
    : `0.25 ${activeAsset}`;

  const casePaymentSeg = flow.paymentId
    ? flow.paymentId.slice(-6).toUpperCase()
    : "PENDING";

  /* state machine for the ticket header + spine */
  const ticketStage = flow.unlocked
    ? "cleared"
    : flow.txHash
      ? "cleared"
      : flow.verifyValid
        ? "pending"
        : flow.paymentRequired
          ? "pending"
          : "pending";

  const ticketStateLabel = flow.unlocked
    ? "DATA UNLOCKED"
    : flow.txHash
      ? "SETTLEMENT FILED"
      : flow.verifyValid
        ? "AWAITING CLEARANCE"
        : flow.paymentRequired
          ? "402 ISSUED · VERIFY NEXT"
          : "READY FOR REQUEST";

  const spineLabel = flow.unlocked
    ? "CLEARED · FILED"
    : flow.txHash
      ? "SETTLED"
      : flow.verifyValid
        ? "AWAITING OPERATOR"
        : flow.paymentRequired
          ? "PAYMENT REQUIRED"
          : "INTAKE";

  /* Clearing Rail stations */
  const railSteps: Array<{
    label: string;
    code: string;
    status: "done" | "active" | "pending" | "denied";
    proof: string;
  }> = [
    {
      label: "Request",
      code: "01",
      status: flow.requestStatus ? "done" : "active",
      proof: flow.requestStatus ? "issued" : "awaiting",
    },
    {
      label: "402",
      code: "02",
      status: flow.requestStatus === 402 ? "done" : "pending",
      proof: flow.requestStatus === 402 ? "payment required" : "—",
    },
    {
      label: "Verify",
      code: "03",
      status: flow.verifyValid
        ? "done"
        : flow.paymentRequired
          ? "active"
          : "pending",
      proof: flow.verifyValid ? "policy valid" : flow.verifyStatus ?? "—",
    },
    {
      label: "Clear",
      code: "04",
      status: flow.txHash
        ? "done"
        : flow.verifyValid
          ? "active"
          : "pending",
      proof: flow.txHash ? "operator ok" : hasOperatorKey ? "ready" : "key req.",
    },
    {
      label: "Settle",
      code: "05",
      status: flow.txHash ? "done" : "pending",
      proof: flow.txHash ? short(flow.txHash) : "—",
    },
    {
      label: "File",
      code: "06",
      status: flow.unlocked ? "done" : flow.txHash ? "active" : "pending",
      proof: flow.unlocked ? "receipt filed" : "—",
    },
    {
      label: "Unlock",
      code: "07",
      status: flow.unlocked ? "done" : "pending",
      proof: flow.unlocked ? "data live" : "locked",
    },
  ];

  /* next action dock */
  const nextAction: {
    step: string;
    title: ReactNode;
    detail: string;
    button: ReactNode;
    tone: "ready" | "pending" | "cleared";
  } = !flow.paymentRequired
    ? {
        step: "Step 01 · Request",
        title: (
          <>
            Ask the merchant for <em>TSLA market data.</em>
          </>
        ),
        detail:
          "The verified merchant will answer with HTTP 402 Payment Required and an x402-compatible challenge body.",
        tone: "ready",
        button: (
          <button
            className="btn primary"
            disabled={busy !== ""}
            onClick={onRequest}
          >
            Request paid data <ArrowRight size={14} />
          </button>
        ),
      }
    : !flow.verifyValid
      ? {
          step: "Step 02 · Verify",
          title: (
            <>
              Run the <em>policy clearance check.</em>
            </>
          ),
          detail:
            "Osmium verifies merchant, token, amount, receipt, context and replay before any funds can move.",
          tone: "pending",
          button: (
            <button
              className="btn primary"
              disabled={busy !== ""}
              onClick={onVerify}
            >
              Verify clearance <ArrowRight size={14} />
            </button>
          ),
        }
      : !flow.txHash
        ? {
            step: "Step 03 · Clear and settle",
            title: (
              <>
                Operator <em>clears and settles.</em>
              </>
            ),
            detail:
              "Clearance unlocks below. Approval calls the protected runner; the SettlementRouter then moves 0.25 TSLA to the verified merchant.",
            tone: "pending",
            button: null,
          }
        : !flow.unlocked
          ? {
              step: "Step 04 · Unlock",
              title: (
                <>
                  Filed receipt <em>unlocks the resource.</em>
                </>
              ),
              detail:
                "The merchant signed an EIP-712 receipt. Re-fetch the resource with paymentId + receiptHash to read the data.",
              tone: "pending",
              button: (
                <button
                  className="btn primary"
                  disabled={busy !== ""}
                  onClick={onRequest}
                >
                  Re-request resource <ArrowRight size={14} />
                </button>
              ),
            }
          : {
              step: "Cleared",
              title: (
                <>
                  Cleared. <em>Replay denied.</em>
                </>
              ),
              detail:
                "The clearance is filed onchain. Run a new case, or attempt a replay to confirm the same paymentId cannot be reused.",
              tone: "cleared",
              button: (
                <button
                  className="btn primary"
                  disabled={busy !== ""}
                  onClick={onRequest}
                >
                  Start a new case <ArrowRight size={14} />
                </button>
              ),
            };

  const policyChecks: Array<{ label: string; tone: "cleared" | "pending" }> = [
    { label: "Merchant verified", tone: flow.verifyValid ? "cleared" : "pending" },
    { label: "Token allowed", tone: flow.verifyValid ? "cleared" : "pending" },
    { label: "Under spend limit", tone: flow.verifyValid ? "cleared" : "pending" },
    { label: "Receipt required", tone: flow.verifyValid ? "cleared" : "pending" },
    { label: "Replay protected", tone: flow.verifyValid ? "cleared" : "pending" },
    { label: "Context bound", tone: flow.verifyValid ? "cleared" : "pending" },
  ];

  /* Forecast the impact of the *next* settlement.
     /demo/live-settlement/preview returns identical before/after snapshots
     (no transaction is executed between the two reads), so any "delta"
     derived from it is structurally zero. We project from the known amount
     instead. The router vault is intentionally a pass-through: the runner
     tops it up just-in-time and settleWithIntent drains it in the same flow,
     so its net change is always zero by design. */
  const amountWei = flow.amount ?? "250000000000000000";
  const merchantBeforeWei = settlement?.before.merchantToken ?? "0";
  const merchantAfterWei = (
    BigInt(merchantBeforeWei) + BigInt(amountWei)
  ).toString();

  const merchantImpact = `${formatToken(merchantBeforeWei, activeAsset)} → ${formatToken(
    merchantAfterWei,
    activeAsset,
  )}  (+${formatToken(amountWei, activeAsset)})`;

  const vaultImpact = `pass-through · ${amountLabel} in, ${amountLabel} out`;

  const showPacket = Boolean(flow.verifyValid && !flow.txHash);

  return (
    <>
      <header className="pageHead">
        <div>
          <div className="eyebrow">Operator console · TSLA clearance</div>
          <h1>
            Agents request. <em>Osmium clears.</em>
          </h1>
        </div>
        <div className="pageSub">
          <div>
            <strong>Live testnet</strong> · Robinhood Chain
          </div>
          <div>
            Policy <strong>#2</strong> · Engine{" "}
            <strong>{short(config.engineAddress)}</strong>
          </div>
        </div>
      </header>

      <section className="statusStrip" aria-label="Clearing house readiness">
        <StatusCell
          label="Agent"
          value="Ready"
          detail="market data agent"
          tone={runnerStatus === "online" ? "ok" : "warn"}
        />
        <StatusCell
          label="Policy"
          value="Armed"
          detail={`PolicyEngine ${short(config.engineAddress)}`}
          tone="ok"
        />
        <StatusCell
          label="Vault"
          value={settlement ? "Funded" : "Funded"}
          detail={
            settlement
              ? `Router holds ${formatToken(settlement.after.routerVault, activeAsset)}`
              : "Router holds delegated vault"
          }
          tone="ok"
        />
        <StatusCell
          label="Merchant"
          value="Verified"
          detail={quote?.title ?? "Verified Market Data API"}
          tone="ok"
        />
      </section>

      <ClearanceTicket
        amountLabel={amountLabel}
        casePaymentSeg={casePaymentSeg}
        flow={flow}
        nextLabel={
          !flow.paymentRequired
            ? "Request paid data"
            : !flow.verifyValid
              ? "Verify clearance"
              : !flow.txHash
                ? "Operator review below"
                : !flow.unlocked
                  ? "Re-request resource"
                  : "Filed · check Prove"
        }
        spineLabel={spineLabel}
        stage={ticketStage}
        stateLabel={ticketStateLabel}
      />

      <ClearingRail steps={railSteps} />

      <div
        className={`actionDock ${nextAction.tone}`}
        aria-label="Next action"
      >
        <div className="actionLead">
          <span className="step">{nextAction.step}</span>
          <span className="title">{nextAction.title}</span>
          <span className="detail">{nextAction.detail}</span>
        </div>
        {nextAction.button ? (
          <div>{nextAction.button}</div>
        ) : null}
      </div>

      {showPacket ? (
        <OperatorClearancePacket
          amountLabel={amountLabel}
          busy={busy}
          canSettle={canSettle}
          checks={policyChecks}
          flow={flow}
          merchantImpact={merchantImpact}
          operatorKey={operatorKey}
          vaultImpact={vaultImpact}
          onClearKey={onClearKey}
          onDeny={onDeny}
          onSetOperatorKey={onSetOperatorKey}
          onSettle={onSettle}
        />
      ) : null}

      <details className="advanced">
        <summary>x402 protocol detail · request body</summary>
        <div className="advancedBody">
          <ProofGrid
            rows={[
              { k: "Protocol", v: flow.protocol ?? "x402-compatible-osmium" },
              { k: "Scheme", v: flow.scheme ?? "osmium-exact" },
              { k: "Network", v: flow.network ?? "eip155:46630" },
              {
                k: "Resource",
                v: flow.paymentRequired?.accepts[0].resource.url ?? "—",
              },
              {
                k: "Token",
                v: flow.token ? short(flow.token) : short(assets[0].address),
              },
              {
                k: "Pay To",
                v: flow.paymentRequired
                  ? short(flow.paymentRequired.accepts[0].payTo)
                  : `Router ${short(config.routerAddress)}`,
              },
              { k: "Payment Id", v: flow.paymentId ? short(flow.paymentId) : "—" },
              {
                k: "Receipt Hash",
                v: flow.receiptHash ? short(flow.receiptHash) : "—",
              },
              {
                k: "Settlement Tx",
                v: flow.txHash ? short(flow.txHash) : "—",
              },
              {
                k: "Recovered signer",
                v: flow.merchantReceipt?.recoveredSigner
                  ? short(flow.merchantReceipt.recoveredSigner)
                  : "—",
              },
              {
                k: "Signature verified",
                v: flow.merchantReceipt?.verified
                  ? "true · EIP-712"
                  : flow.merchantReceipt?.signature
                    ? "signed · unverified"
                    : "pending",
              },
              { k: "Facilitator", v: "Custom x402-compatible (not CDP)" },
            ]}
          />
        </div>
      </details>

      <details className="advanced">
        <summary>Denial cases · why a clearance gets blocked</summary>
        <div className="advancedBody">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <DenialChip
              label="Unknown merchant"
              busy={busy === "unknown"}
              onClick={() => onPreviewBlocked("unknown")}
            />
            <DenialChip
              label="Missing receipt"
              busy={busy === "missing"}
              onClick={() => onPreviewBlocked("missing")}
            />
            <DenialChip
              label="Over spend limit"
              busy={busy === "over"}
              onClick={() => onPreviewBlocked("over")}
            />
            <DenialChip
              label="Replay attempt"
              busy={busy === "replay"}
              onClick={onReplay}
            />
          </div>
          <p
            style={{
              marginTop: "16px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "var(--muted)",
            }}
          >
            Each preview filed in the Settlement Ledger under Prove.
          </p>
        </div>
      </details>

      {merchantAudit[0]?.unlocked && unlock?.payload ? (
        <details className="advanced">
          <summary>Latest unlocked payload</summary>
          <div className="advancedBody">
            <ProofGrid
              rows={[
                { k: "Symbol", v: unlock.payload.symbol },
                { k: "Snapshot", v: unlock.payload.snapshot },
                { k: "Settlement", v: unlock.payload.settlement },
                { k: "Data hash", v: short(unlock.dataHash) },
              ]}
            />
          </div>
        </details>
      ) : null}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Clear screen primitives
   ──────────────────────────────────────────────────────────────────────── */

function StatusCell({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warn" | "info";
}) {
  return (
    <div className={`statusCell ${tone}`}>
      <div className="statusLabel">{label}</div>
      <div className="statusValue">{value}</div>
      <div className="statusDetail">{detail}</div>
    </div>
  );
}

function ClearanceTicket({
  amountLabel,
  casePaymentSeg,
  flow,
  nextLabel,
  spineLabel,
  stage,
  stateLabel,
}: {
  amountLabel: string;
  casePaymentSeg: string;
  flow: X402FlowState;
  nextLabel: string;
  spineLabel: string;
  stage: "cleared" | "pending" | "denied";
  stateLabel: string;
}) {
  const policyId = flow.paymentRequired?.accepts[0]?.extra.policyId ?? "2";
  return (
    <section
      className={`clearanceTicket ${stage} fade-in`}
      aria-label="Clearance ticket"
    >
      <div className="ticketSpine">
        <div className="spineLabel">{spineLabel}</div>
      </div>
      <div className="ticketBody">
        <div className="ticketHead">
          <div>
            <div className="caseLabel">Case</div>
            <div className="caseId">
              OS-TSLA-402
              <span className="caseSeg">#{casePaymentSeg}</span>
            </div>
          </div>
          <div className="ticketStamp">
            <div className="stampLabel">Status</div>
            <span
              className={`proofStamp big ${stage === "cleared" ? "cleared" : "pending"} stamp-in`}
            >
              {stateLabel}
            </span>
          </div>
        </div>
        <dl className="ticketFacts">
          <div className="fact">
            <dt>Agent</dt>
            <dd>Market Data Agent</dd>
          </div>
          <div className="fact">
            <dt>Merchant</dt>
            <dd>Verified Market Data API</dd>
          </div>
          <div className="fact">
            <dt>Asset</dt>
            <dd className="mono">TSLA · {short(assets[0].address)}</dd>
          </div>
          <div className="fact">
            <dt>Amount</dt>
            <dd className="amount">{amountLabel}</dd>
          </div>
          <div className="fact">
            <dt>Resource</dt>
            <dd>market-data snapshot</dd>
          </div>
          <div className="fact">
            <dt>Next</dt>
            <dd>{nextLabel}</dd>
          </div>
        </dl>
        <div className="ticketFootnote">
          <span>
            Osmium Clearing · Policy #{policyId} · Robinhood Chain Testnet
          </span>
          <span className="seal">x402 · osmium-delegated-vault</span>
        </div>
      </div>
    </section>
  );
}

function ClearingRail({
  steps,
}: {
  steps: Array<{
    label: string;
    code: string;
    status: "done" | "active" | "pending" | "denied";
    proof: string;
  }>;
}) {
  return (
    <section className="clearingRail" aria-label="Clearing rail">
      {steps.map((step) => (
        <div className={`station ${step.status}`} key={step.label}>
          <div className="stationNode">
            {step.status === "done" ? <Check size={12} strokeWidth={3} /> : step.code}
          </div>
          <div className="stationLabel">{step.label}</div>
          <div className="stationProof">{step.proof}</div>
        </div>
      ))}
    </section>
  );
}

function OperatorClearancePacket({
  amountLabel,
  busy,
  canSettle,
  checks,
  flow,
  merchantImpact,
  operatorKey,
  vaultImpact,
  onClearKey,
  onDeny,
  onSetOperatorKey,
  onSettle,
}: {
  amountLabel: string;
  busy: string;
  canSettle: boolean;
  checks: Array<{ label: string; tone: "cleared" | "pending" }>;
  flow: X402FlowState;
  merchantImpact: string;
  operatorKey: string;
  vaultImpact: string;
  onClearKey: () => void;
  onDeny: () => void;
  onSetOperatorKey: (v: string) => void;
  onSettle: () => void;
}) {
  const filled = operatorKey.trim().length > 0;
  const receiptStatus = flow.merchantReceipt?.verified
    ? "EIP-712 verified"
    : "EIP-712 required";
  return (
    <section className="operatorPacket slide-in" aria-label="Operator clearance">
      <div className="packetSeal" aria-hidden="true">
        <div className="sealText">
          Operator
          <br />
          clearance
          <br />
          required
        </div>
      </div>

      <header className="packetHead">
        <div className="packetEyebrow">Manual checkpoint · money can move</div>
        <h2>
          Review this agent spend <em>before funds move.</em>
        </h2>
        <p>
          Osmium verified policy. You decide whether the SettlementRouter
          executes the payment to the verified merchant. The agent never holds
          the operator key.
        </p>
      </header>

      <dl className="packetFacts">
        <div className="fact">
          <dt>Agent</dt>
          <dd>Market Data Agent</dd>
        </div>
        <div className="fact">
          <dt>Merchant</dt>
          <dd>Verified Market Data API</dd>
        </div>
        <div className="fact">
          <dt>Resource</dt>
          <dd>market-data snapshot</dd>
        </div>
        <div className="fact">
          <dt>Asset</dt>
          <dd className="mono">TSLA · {short(assets[0].address)}</dd>
        </div>
        <div className="fact">
          <dt>Amount</dt>
          <dd className="mono">{amountLabel}</dd>
        </div>
        <div className="fact">
          <dt>Policy result</dt>
          <dd className="with-stamp">
            <span className="proofStamp cleared">Valid</span>
          </dd>
        </div>
        <div className="fact">
          <dt>Required receipt</dt>
          <dd className="with-stamp">
            <span className="proofStamp paper">{receiptStatus}</span>
          </dd>
        </div>
        <div className="fact">
          <dt>Replay protection</dt>
          <dd className="with-stamp">
            <span className="proofStamp cleared">Enabled</span>
          </dd>
        </div>
      </dl>

      <div className="packetImpact">
        <div className="impact">
          <div className="impactLabel">Merchant balance · forecast</div>
          <div className="impactDelta">{merchantImpact}</div>
        </div>
        <div className="impact">
          <div className="impactLabel">Router vault · pass-through</div>
          <div className="impactDelta">{vaultImpact}</div>
        </div>
      </div>

      <div className="packetChecks" style={{ marginBottom: 20 }}>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          aria-label="Policy checks"
        >
          {checks.map((c) => (
            <span key={c.label} className={`proofStamp ${c.tone}`}>
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className={`keyField ${filled ? "filled" : ""}`}>
        <label htmlFor="operatorKey">Session-only operator key</label>
        <input
          id="operatorKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={operatorKey}
          onChange={(e) => onSetOperatorKey(e.target.value)}
          placeholder="paste the runner operator key…"
        />
        <div className="keyHint">
          {filled
            ? "Held in this session only · cleared on tab close · never sent to chain"
            : "Never stored in frontend env · session-only · masked"}
        </div>
        {filled ? (
          <button className="keyClear" onClick={onClearKey} type="button">
            clear
          </button>
        ) : null}
      </div>

      <div className="packetActions">
        <button
          className="btn primary"
          disabled={busy !== "" || !canSettle}
          onClick={onSettle}
          type="button"
        >
          Clear and settle · {amountLabel} <ArrowRight size={14} />
        </button>
        <button
          className="btn danger"
          disabled={busy !== ""}
          onClick={onDeny}
          type="button"
        >
          <X size={14} /> Deny request
        </button>
      </div>
    </section>
  );
}

function DenialChip({
  label,
  onClick,
  busy,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={onClick}
      disabled={busy}
      style={{
        justifyContent: "space-between",
        height: 56,
        padding: "0 18px",
      }}
    >
      <span style={{ letterSpacing: "0.08em" }}>{label}</span>
      <ArrowRight size={13} />
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   ProveView — Settlement Ledger
   ──────────────────────────────────────────────────────────────────────── */

type LedgerRow = {
  id: string;
  time: string;
  event: string;
  asset: string;
  amount: string;
  decision: "CLEARED" | "DENIED" | "FILED" | "PROOF";
  proofLabel: string;
  proofHref?: string;
  tone: "cleared" | "denied" | "paper" | "protocol";
};

function ProveView({
  demo,
  merchantAudit,
  settlement,
  spendEvents,
  unlock,
}: {
  demo: DemoPreview[];
  merchantAudit: MerchantAuditRecord[];
  settlement: LiveSettlement | null;
  spendEvents: SpendEvent[];
  unlock: MerchantUnlock | null;
}) {
  const rows = useMemo<LedgerRow[]>(() => {
    const r: LedgerRow[] = [];

    merchantAudit.forEach((rec) => {
      r.push({
        id: `audit-${rec.paymentId}-settle`,
        time: formatLedgerTime(rec.timestamp),
        event: "Settlement executed",
        asset: rec.asset,
        amount: formatToken(rec.amount, rec.asset),
        decision: "FILED",
        proofLabel: isFullTxHash(rec.txHash) ? short(rec.txHash) : "local proof",
        proofHref: isFullTxHash(rec.txHash) ? txUrl(rec.txHash) : undefined,
        tone: "cleared",
      });
      if (rec.merchantReceipt?.verified) {
        r.push({
          id: `audit-${rec.paymentId}-receipt`,
          time: formatLedgerTime(rec.timestamp + 1),
          event: "Receipt filed · EIP-712 verified",
          asset: rec.asset,
          amount: "—",
          decision: "FILED",
          proofLabel: short(rec.receiptHash),
          tone: "paper",
        });
      }
      if (rec.unlocked) {
        r.push({
          id: `audit-${rec.paymentId}-unlock`,
          time: formatLedgerTime(rec.timestamp + 2),
          event: "Data unlocked",
          asset: rec.asset,
          amount: "—",
          decision: "CLEARED",
          proofLabel: rec.title ?? rec.service ?? "market-data snapshot",
          tone: "cleared",
        });
      }
    });

    if (settlement) {
      r.push({
        id: `settlement-${settlement.paymentId}-replay`,
        time: "—",
        event: settlement.replay.blocked
          ? "Replay denied"
          : "Replay open",
        asset: tokenSymbolFor(settlement.token),
        amount: "—",
        decision: settlement.replay.blocked ? "DENIED" : "CLEARED",
        proofLabel: settlement.replay.reasonName,
        tone: settlement.replay.blocked ? "denied" : "cleared",
      });
    }

    spendEvents.forEach((ev, i) => {
      r.push({
        id: `spend-${i}-${ev.status}`,
        time: "live",
        event: ev.detail,
        asset: "—",
        amount: "—",
        decision:
          ev.status === "Cleared"
            ? "CLEARED"
            : ev.status === "Filed"
              ? "FILED"
              : "DENIED",
        proofLabel: ev.reason ?? (ev.tx ? short(ev.tx) : "local proof"),
        proofHref: ev.tx && isFullTxHash(ev.tx) ? txUrl(ev.tx) : undefined,
        tone:
          ev.status === "Denied"
            ? "denied"
            : ev.status === "Cleared"
              ? "cleared"
              : "paper",
      });
    });

    demo.forEach((d, i) => {
      r.push({
        id: `demo-${i}-${d.label}`,
        time: "preview",
        event: d.label,
        asset: "—",
        amount: "—",
        decision: d.preview.allowed ? "CLEARED" : "DENIED",
        proofLabel: d.preview.reasonName,
        tone: d.preview.allowed ? "protocol" : "denied",
      });
    });

    return r;
  }, [merchantAudit, settlement, spendEvents, demo]);

  const latestTx = merchantAudit.find((r) => isFullTxHash(r.txHash))?.txHash;
  const latestReceipt =
    merchantAudit[0]?.receiptHash ?? settlement?.receiptHash ?? "—";
  const replayState = settlement?.replay.blocked
    ? "DENIED"
    : settlement
      ? "OPEN"
      : "—";

  return (
    <>
      <header className="pageHead">
        <div>
          <div className="eyebrow">Settlement Ledger</div>
          <h1>
            Every clearance, <em>filed.</em>
          </h1>
        </div>
        <div className="pageSub">
          <div>
            <strong>{rows.length}</strong> ledger rows
          </div>
          <div>
            Merchant audit · <strong>{merchantAudit.length}</strong> filings
          </div>
        </div>
      </header>

      <section className="ledgerHead" aria-label="Ledger summary">
        <div className="stat">
          <div className="statLabel">Latest tx</div>
          <div className="statValue">{latestTx ? short(latestTx) : "—"}</div>
          <div className="statSub">SettlementRouter · onchain</div>
        </div>
        <div className="stat">
          <div className="statLabel">Latest filed receipt</div>
          <div className="statValue">
            {latestReceipt && latestReceipt !== "—"
              ? short(latestReceipt)
              : "—"}
          </div>
          <div className="statSub">EIP-712 · merchant signed</div>
        </div>
        <div className="stat">
          <div className="statLabel">Replay status</div>
          <div className="statValue">{replayState}</div>
          <div className="statSub">
            {settlement?.replay.blocked
              ? "paymentId consumed by PolicyEngine"
              : "no replay attempted"}
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="ledgerEmpty">
          <div className="emptyTitle">
            The ledger is empty. <em>Run a clearance first.</em>
          </div>
          <div className="emptyBody">
            Settlement rows, filed receipts and replay decisions appear here as
            soon as the Clear screen runs through the rail.
          </div>
          <a className="linkOut" href="#clear">
            Go to Clear <ArrowRight size={13} />
          </a>
        </div>
      ) : (
        <div className="ledger" role="table">
          <div className="ledgerHeader" role="row">
            <span>Time</span>
            <span>Event</span>
            <span className="col-asset">Asset</span>
            <span className="col-amount">Amount</span>
            <span>Decision</span>
            <span className="col-proof">Proof</span>
          </div>
          {rows.map((row) => (
            <div className="ledgerRow" role="row" key={row.id}>
              <span className="col-time">{row.time}</span>
              <span className="col-event">{row.event}</span>
              <span className="col-asset">{row.asset}</span>
              <span className="col-amount">{row.amount}</span>
              <span>
                <span className={`proofStamp ${row.tone}`}>{row.decision}</span>
              </span>
              <span className="col-proof">
                {row.proofHref ? (
                  <a
                    href={row.proofHref}
                    target="_blank"
                    rel="noreferrer"
                    title={row.proofLabel}
                  >
                    <ExternalLink size={12} /> {row.proofLabel}
                  </a>
                ) : (
                  <span title={row.proofLabel}>{row.proofLabel}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {settlement ? (
        <details className="advanced" style={{ marginTop: 24 }}>
          <summary>Last settlement · raw proof values</summary>
          <div className="advancedBody">
            <ProofGrid
              rows={[
                {
                  k: "Policy",
                  v: `#${settlement.policyId} · ${tokenSymbolFor(settlement.token)}`,
                },
                {
                  k: "Payment Id",
                  v: short(settlement.paymentId),
                },
                {
                  k: "Receipt Hash",
                  v: short(settlement.receiptHash),
                },
                {
                  k: "Intent Hash",
                  v: short(settlement.intentHash),
                },
                {
                  k: "Context Hash",
                  v: short(settlement.contextHash),
                },
                {
                  k: "Settle Tx",
                  v: short(settlement.transactions.settle),
                },
                {
                  k: "Block",
                  v: settlement.transactions.settleBlock,
                },
                {
                  k: "Replay reason",
                  v: settlement.replay.reasonName,
                },
              ]}
            />
            {settlement.transactions.settle ? (
              <a
                className="linkOut"
                style={{ marginTop: 14, display: "inline-flex" }}
                href={txUrl(settlement.transactions.settle)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={12} /> View on Robinhood explorer
              </a>
            ) : null}
          </div>
        </details>
      ) : null}

      {unlock?.merchantReceipt ? (
        <details className="advanced">
          <summary>Merchant EIP-712 receipt</summary>
          <div className="advancedBody">
            <ProofGrid
              rows={[
                { k: "Standard", v: unlock.merchantReceipt.standard },
                {
                  k: "Domain name",
                  v: unlock.merchantReceipt.domain.name,
                },
                {
                  k: "Verifying contract",
                  v: short(unlock.merchantReceipt.domain.verifyingContract),
                },
                {
                  k: "Expected signer",
                  v: unlock.merchantReceipt.expectedSigner
                    ? short(unlock.merchantReceipt.expectedSigner)
                    : "configure",
                },
                {
                  k: "Recovered signer",
                  v: unlock.merchantReceipt.recoveredSigner
                    ? short(unlock.merchantReceipt.recoveredSigner)
                    : "pending",
                },
                {
                  k: "Signature",
                  v: unlock.merchantReceipt.signature
                    ? short(unlock.merchantReceipt.signature)
                    : "pending",
                },
                {
                  k: "Verified",
                  v: unlock.merchantReceipt.verified
                    ? "true"
                    : "false / pending",
                },
                { k: "Mode", v: unlock.merchantReceipt.mode },
              ]}
            />
          </div>
        </details>
      ) : null}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   BuildView — embedded SDK docs
   ──────────────────────────────────────────────────────────────────────── */

function BuildView() {
  const code1 = `// 1 · request the protected resource
const challenge = await osmium.getMarketData({
  asset: "TSLA"
})
// merchant answers HTTP 402 with the x402 challenge body`;

  const code2 = `// 2 · run the policy clearance check
const clearance = await osmium.verifyX402(
  challenge.paymentRequired
)
if (!clearance.isValid) throw new Error(clearance.invalidReason)`;

  const code3 = `// 3 · operator clears & settles, merchant files receipt
const settlement = await osmium.settleX402(
  challenge.paymentRequired,
  { operatorApiKey }       // session-only · never sent to the agent
)

// 4 · unlock with paymentId + filed receipt
const data = await osmium.getMarketData({
  asset:       "TSLA",
  paymentId:   settlement.paymentId,
  receiptHash: settlement.receiptHash
})`;

  return (
    <>
      <header className="pageHead">
        <div>
          <div className="eyebrow">Integration · @osmium/sdk</div>
          <h1>
            Integrate clearance <em>in 10 minutes.</em>
          </h1>
        </div>
        <div className="pageSub">
          <div>
            <strong>x402-compatible</strong>
          </div>
          <div>Custom Osmium facilitator · not Coinbase CDP</div>
        </div>
      </header>

      <section className="buildLead">
        <p className="lede">
          The agent requests. <em>Osmium verifies.</em> The operator{" "}
          <em>clears.</em> The router settles.
        </p>
        <dl className="ledeMeta">
          <dt className="k">Network</dt>
          <dd className="v">eip155:46630 · Robinhood Chain Testnet</dd>
          <dt className="k">Scheme</dt>
          <dd className="v">osmium-exact</dd>
          <dt className="k">Facilitator</dt>
          <dd className="v">Custom x402-compatible (not CDP)</dd>
          <dt className="k">Assets</dt>
          <dd className="v">TSLA live · AMD &amp; AMZN quote-supported</dd>
          <dt className="k">Engine</dt>
          <dd className="v">{short(config.engineAddress)}</dd>
          <dt className="k">Router</dt>
          <dd className="v">{short(config.routerAddress)}</dd>
        </dl>
      </section>

      <section className="rationale" aria-labelledby="why-osmium-exact">
        <div className="rationaleSpine">
          <span>RATIONALE</span>
        </div>
        <div className="rationaleBody">
          <div className="rationaleHead">
            <span className="rationaleEyebrow">Scheme rationale</span>
            <h2 id="why-osmium-exact">
              Why <em>osmium-exact?</em>
            </h2>
          </div>
          <div className="rationaleProse">
            <p>
              Standard x402 <code>exact</code> settles from the buyer wallet
              via EIP-3009 or Permit2.
            </p>
            <p>
              Osmium uses the x402 HTTP envelope, but replaces the settlement
              primitive with <em>delegated vault clearance.</em>
            </p>
            <p className="rationaleStrong">
              The agent never holds unrestricted spend authority.
            </p>
            <p className="rationaleStrong">
              It requests, Osmium verifies, the operator clears, the router
              settles.
            </p>
          </div>
          <dl className="rationaleCompat">
            <div>
              <dt>Upstream</dt>
              <dd>exact-on-permit2</dd>
            </div>
            <div>
              <dt>Divergence</dt>
              <dd>delegated-vault-settlement</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>
                AI agents request clearance instead of holding spend
                authority.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="steps">
        <div className="step">
          <div className="stepN">01</div>
          <div className="stepBody">
            <h3>Request a protected resource</h3>
            <p>
              The verified merchant returns HTTP 402 with an
              x402-compatible challenge body containing policyId, intentHash,
              contextHash, paymentId and receiptHash.
            </p>
            <div className="stepMeta">
              <span className="proofStamp protocol">GET /merchant/market-data</span>
              <span className="proofStamp paper">402 Payment Required</span>
            </div>
            <CodeBlock file="agent.ts" code={code1} />
          </div>
        </div>

        <div className="step">
          <div className="stepN">02</div>
          <div className="stepBody">
            <h3>Verify the clearance check</h3>
            <p>
              Osmium runs the Stylus PolicyEngine off-the-funds-path: merchant,
              token, amount, receipt, context and replay all checked before any
              router action.
            </p>
            <div className="stepMeta">
              <span className="proofStamp protocol">POST /x402/verify</span>
              <span className="proofStamp cleared">isValid: true</span>
            </div>
            <CodeBlock file="agent.ts" code={code2} />
          </div>
        </div>

        <div className="step">
          <div className="stepN">03</div>
          <div className="stepBody">
            <h3>Operator clears, router settles, merchant files receipt</h3>
            <p>
              The operator API key holds the only spend authority. The agent
              never sees it. SettlementRouter moves funds; merchant signs an
              EIP-712 receipt; replay is denied at the policy layer.
            </p>
            <div className="stepMeta">
              <span className="proofStamp protocol">POST /x402/settle</span>
              <span className="proofStamp paper">EIP-712 receipt</span>
              <span className="proofStamp cleared">Replay denied</span>
            </div>
            <CodeBlock file="operator.ts" code={code3} />
          </div>
        </div>
      </div>

      <div className="buildGrid">
        <div className="buildBox">
          <h4>Endpoints</h4>
          <dl>
            <div className="row">
              <dt>Resource</dt>
              <dd>GET /merchant/market-data</dd>
            </div>
            <div className="row">
              <dt>Verify</dt>
              <dd>POST /x402/verify</dd>
            </div>
            <div className="row">
              <dt>Settle</dt>
              <dd>POST /x402/settle</dd>
            </div>
            <div className="row">
              <dt>Audit</dt>
              <dd>GET /merchant/audit</dd>
            </div>
            <div className="row">
              <dt>Health</dt>
              <dd>GET /health</dd>
            </div>
          </dl>
        </div>
        <div className="buildBox">
          <h4>Onchain</h4>
          <dl>
            <div className="row">
              <dt>Network</dt>
              <dd>eip155:46630</dd>
            </div>
            <div className="row">
              <dt>PolicyEngine</dt>
              <dd>{short(config.engineAddress)}</dd>
            </div>
            <div className="row">
              <dt>SettlementRouter</dt>
              <dd>{short(config.routerAddress)}</dd>
            </div>
            <div className="row">
              <dt>TSLA</dt>
              <dd>{short(assets[0].address)}</dd>
            </div>
            <div className="row">
              <dt>AMD</dt>
              <dd>{short(assets[1].address)}</dd>
            </div>
            <div className="row">
              <dt>AMZN</dt>
              <dd>{short(assets[2].address)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="buildBox">
        <h4>Guarantees</h4>
        <dl>
          <div className="row">
            <dt>Verified merchant + receipt</dt>
            <dd>settled through SettlementRouter</dd>
          </div>
          <div className="row">
            <dt>Replay paymentId</dt>
            <dd>denied by PolicyEngine</dd>
          </div>
          <div className="row">
            <dt>Unknown merchant</dt>
            <dd>denied before funds move</dd>
          </div>
          <div className="row">
            <dt>Missing receipt</dt>
            <dd>denied by receipt gate</dd>
          </div>
          <div className="row">
            <dt>Over max amount</dt>
            <dd>denied by spend limit</dd>
          </div>
          <div className="row">
            <dt>Context mismatch</dt>
            <dd>denied by intent binding</dd>
          </div>
        </dl>
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Generic primitives
   ──────────────────────────────────────────────────────────────────────── */

function ProofGrid({ rows }: { rows: Array<{ k: string; v: string }> }) {
  return (
    <dl className="proofGrid">
      {rows.map((row) => (
        <div className="row" key={row.k}>
          <dt>{row.k}</dt>
          <dd title={row.v}>{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function CodeBlock({ file, code }: { file: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  }
  return (
    <div className="codeBlock">
      <div className="codeBar">
        <span className="codeFile">{file}</span>
        <button className="copy" onClick={copy} type="button">
          {copied ? (
            <>
              <Check size={11} /> copied
            </>
          ) : (
            <>
              <Copy size={11} /> copy
            </>
          )}
        </button>
      </div>
      <pre>
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}

/* tiny token highlighter for the SDK snippets */
function highlight(source: string): ReactNode {
  const lines = source.split("\n");
  return lines.map((line, lineIdx) => {
    const parts: ReactNode[] = [];
    const re =
      /(\/\/[^\n]*)|("[^"]*"|`[^`]*`)|(\b(?:const|await|async|function|return|throw|new|if)\b)|(\b(?:osmium|console)\.[a-zA-Z_]+)|(\b\d+\b)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[1])
        parts.push(
          <span key={`cm-${lineIdx}-${m.index}`} className="tok-cm">
            {m[1]}
          </span>,
        );
      else if (m[2])
        parts.push(
          <span key={`str-${lineIdx}-${m.index}`} className="tok-str">
            {m[2]}
          </span>,
        );
      else if (m[3])
        parts.push(
          <span key={`key-${lineIdx}-${m.index}`} className="tok-key">
            {m[3]}
          </span>,
        );
      else if (m[4])
        parts.push(
          <span key={`fn-${lineIdx}-${m.index}`} className="tok-fn">
            {m[4]}
          </span>,
        );
      else if (m[5])
        parts.push(
          <span key={`num-${lineIdx}-${m.index}`} className="tok-num">
            {m[5]}
          </span>,
        );
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return (
      <span key={lineIdx}>
        {parts}
        {lineIdx < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
