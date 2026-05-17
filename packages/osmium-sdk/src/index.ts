export type OsmiumAsset = "TSLA" | "AMD" | "AMZN";

export type MerchantReceiptAttestation = {
  standard: "EIP-712";
  primaryType: "MerchantReceipt";
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  message: {
    merchant: string;
    agent: string;
    policyId: string;
    asset: string;
    amount: string;
    resourceId: string;
    responseHash: string;
    paymentId: string;
    chainId: string;
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

export type OsmiumClientOptions = {
  runnerUrl: string;
  operatorApiKey?: string;
};

export type MerchantQuote = {
  asset: OsmiumAsset;
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

export type SpendPreview = {
  label: string;
  preview: {
    allowed: boolean;
    reason: number;
    reasonName: string;
  };
};

export type SettlementResult = {
  policyId: string;
  token: string;
  amount: string;
  paymentId: string;
  receiptHash: string;
  transactions: {
    approve?: string;
    deposit?: string;
    settle: string;
  };
  replay: {
    blocked: boolean;
    reasonName: string;
  };
};

export type UnlockResult = {
  asset: OsmiumAsset;
  service: string;
  paymentId: string;
  receiptHash: string;
  dataHash: string;
  unlocked: boolean;
  merchantReceipt?: MerchantReceiptAttestation | null;
  payload: unknown;
};

export type MarketDataResponse =
  | UnlockResult
  | {
      error: "payment_required";
      protocol: "x402-style-demo" | "x402-compatible-osmium";
      asset: OsmiumAsset;
      service: string;
      payment: {
        network: string;
        chainId: number;
        token: string;
        merchant: string;
        amount: string;
        displayAmount: string;
        serviceId: string;
        dataHash: string;
        receiptHash: string;
        receiptStandard?: string;
        settlement: string;
      };
    };

export type OsmiumX402PaymentDetails = {
  scheme: "osmium-exact";
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  extra: {
    assetSymbol: OsmiumAsset;
    service: string;
    serviceId: string;
    dataHash: string;
    receiptHash: string;
    paymentId: string;
    merchant: string;
    policyId: string;
    intentHash: string;
    contextHash: string;
    settlement: "osmium-delegated-vault";
    note: string;
  };
};

export type OsmiumX402PaymentRequired = {
  x402Version: 2;
  error: "payment_required";
  protocol: "x402-compatible-osmium";
  accepts: OsmiumX402PaymentDetails[];
};

export type OsmiumX402PaymentPayload = {
  x402Version: 2;
  accepted: OsmiumX402PaymentDetails;
  payload: {
    scheme: "osmium-delegated-vault";
    payer?: string;
    policyId: string;
    intentHash: string;
    contextHash: string;
    merchant: string;
    paymentId: string;
    receiptHash: string;
  };
  resource: OsmiumX402PaymentDetails["resource"];
};

export type OsmiumX402Supported = {
  kinds: Array<{
    x402Version: 2;
    scheme: "osmium-exact";
    network: string;
    assets: OsmiumAsset[];
    settlement: "osmium-delegated-vault";
  }>;
  note: string;
};

export type OsmiumX402VerifyResult = {
  isValid: boolean;
  payer: string;
  invalidReason?: string;
  invalidMessage?: string;
  network?: string;
  scheme?: string;
  settlement?: string;
  paymentId?: string;
  receiptHash?: string;
};

export type OsmiumX402SettleResult = {
  success: boolean;
  payer: string;
  transaction?: string;
  network: string;
  amount: string;
  paymentId?: string;
  receiptHash?: string;
  errorReason?: string;
  errorMessage?: string;
  settlement?: SettlementResult;
};

function decodeBase64Json<T>(value: string): T {
  if (typeof atob === "function") {
    return JSON.parse(atob(value)) as T;
  }
  const maybeBuffer = (globalThis as unknown as { Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } } })
    .Buffer;
  if (!maybeBuffer) throw new Error("No base64 decoder available");
  return JSON.parse(maybeBuffer.from(value, "base64").toString("utf8")) as T;
}

export class OsmiumClient {
  private readonly runnerUrl: string;
  private readonly operatorApiKey?: string;

  constructor(options: OsmiumClientOptions) {
    this.runnerUrl = options.runnerUrl.replace(/\/$/, "");
    this.operatorApiKey = options.operatorApiKey;
  }

  getQuote(asset: OsmiumAsset): Promise<MerchantQuote> {
    return this.request(`/merchant/quote?asset=${asset}`, "GET");
  }

  previewSpend(): Promise<SpendPreview[]> {
    return this.request("/demo/preview", "POST");
  }

  executeSettlement(): Promise<SettlementResult> {
    if (!this.operatorApiKey) {
      throw new Error("operatorApiKey is required for executeSettlement");
    }
    return this.request("/demo/live-settlement/run", "POST", undefined, this.operatorApiKey);
  }

  unlockReceipt(input: { asset: OsmiumAsset; paymentId: string; receiptHash: string }): Promise<UnlockResult> {
    return this.request("/merchant/receipt", "POST", input);
  }

  getMarketData(input: { asset: OsmiumAsset; paymentId?: string; receiptHash?: string }): Promise<MarketDataResponse> {
    const params = new URLSearchParams({ asset: input.asset });
    if (input.paymentId) params.set("paymentId", input.paymentId);
    if (input.receiptHash) params.set("receiptHash", input.receiptHash);
    return this.request(`/merchant/market-data?${params.toString()}`, "GET", undefined, undefined, [200, 402]);
  }

  getX402Supported(): Promise<OsmiumX402Supported> {
    return this.request("/x402/supported", "GET");
  }

  async getPaymentRequired(asset: OsmiumAsset): Promise<OsmiumX402PaymentRequired> {
    const response = await fetch(`${this.runnerUrl}/merchant/market-data?asset=${asset}`, {
      method: "GET",
      headers: { "content-type": "application/json" }
    });
    if (response.status !== 402) {
      throw new Error(`Expected 402 Payment Required, got ${response.status}`);
    }
    const header = response.headers.get("PAYMENT-REQUIRED");
    if (header) return decodeBase64Json<OsmiumX402PaymentRequired>(header);
    return (await response.json()) as OsmiumX402PaymentRequired;
  }

  createPaymentPayload(paymentRequired: OsmiumX402PaymentRequired, payer?: string): OsmiumX402PaymentPayload {
    const accepted = paymentRequired.accepts[0];
    return {
      x402Version: 2,
      accepted,
      payload: {
        scheme: "osmium-delegated-vault",
        payer,
        policyId: accepted.extra.policyId,
        intentHash: accepted.extra.intentHash,
        contextHash: accepted.extra.contextHash,
        merchant: accepted.extra.merchant,
        paymentId: accepted.extra.paymentId,
        receiptHash: accepted.extra.receiptHash
      },
      resource: accepted.resource
    };
  }

  verifyX402(input: {
    paymentRequired: OsmiumX402PaymentRequired;
    paymentPayload?: OsmiumX402PaymentPayload;
  }): Promise<OsmiumX402VerifyResult> {
    return this.request("/x402/verify", "POST", {
      x402Version: 2,
      paymentRequirements: input.paymentRequired,
      paymentPayload: input.paymentPayload ?? this.createPaymentPayload(input.paymentRequired)
    });
  }

  settleX402(input: {
    paymentRequired: OsmiumX402PaymentRequired;
    paymentPayload?: OsmiumX402PaymentPayload;
  }): Promise<OsmiumX402SettleResult> {
    if (!this.operatorApiKey) {
      throw new Error("operatorApiKey is required for settleX402");
    }
    return this.request(
      "/x402/settle",
      "POST",
      {
        x402Version: 2,
        paymentRequirements: input.paymentRequired,
        paymentPayload: input.paymentPayload ?? this.createPaymentPayload(input.paymentRequired)
      },
      this.operatorApiKey,
      [200, 402]
    );
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    apiKey?: string,
    okStatuses = [200]
  ): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers["x-osmium-api-key"] = apiKey;
    const response = await fetch(`${this.runnerUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!okStatuses.includes(response.status)) throw new Error(await response.text());
    return (await response.json()) as T;
  }
}
