export type OsmiumAsset = "TSLA" | "AMD";

export type OsmiumClientOptions = {
  runnerUrl: string;
  operatorApiKey?: string;
};

export type MerchantQuote = {
  asset: OsmiumAsset;
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
  payload: unknown;
};

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

  private async request<T>(path: string, method: "GET" | "POST", body?: unknown, apiKey?: string): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers["x-osmium-api-key"] = apiKey;
    const response = await fetch(`${this.runnerUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
}
