export type Osmium402MerchantConfig = {
  resource: string;
  asset: string;
  price: string;
  token: `0x${string}`;
  merchant: `0x${string}`;
  policyContext: string;
  runnerUrl: string;
};

export type Osmium402Challenge = {
  status: 402;
  headers: {
    "PAYMENT-REQUIRED": string;
  };
  body: {
    x402Version: 2;
    error: "payment_required";
    protocol: "x402-compatible-osmium";
    accepts: Array<{
      scheme: "osmium-exact";
      network: "eip155:46630";
      asset: string;
      amount: string;
      payTo: `0x${string}`;
      resource: {
        url: string;
        description: string;
        mimeType: "application/json";
      };
      extra: {
        assetSymbol: string;
        merchant: `0x${string}`;
        token: `0x${string}`;
        policyContext: string;
      };
    }>;
  };
};

export type Osmium402UnlockResult =
  | { unlocked: true; dataHash?: string }
  | { unlocked: false; reason: "MissingReceipt" | "ContextMismatch" | "RunnerDenied" };

function encodePaymentRequired(body: Osmium402Challenge["body"]) {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

function runnerEndpoint(runnerUrl: string, path: string) {
  const base = runnerUrl.replace(/\/$/, "");
  if (base.endsWith("/api/runner")) {
    const [runnerPath, query = ""] = path.replace(/^\//, "").split("?");
    const params = new URLSearchParams(query);
    params.set("runnerPath", runnerPath);
    return `${base}?${params.toString()}`;
  }
  return `${base}${path}`;
}

export function withOsmium402(config: Osmium402MerchantConfig) {
  const runnerUrl = config.runnerUrl;

  function paymentRequired(requestUrl = `/${config.resource}`): Osmium402Challenge {
    const body: Osmium402Challenge["body"] = {
      x402Version: 2,
      error: "payment_required",
      protocol: "x402-compatible-osmium",
      accepts: [
        {
          scheme: "osmium-exact",
          network: "eip155:46630",
          asset: config.asset,
          amount: config.price,
          payTo: config.merchant,
          resource: {
            url: requestUrl,
            description: `Protected ${config.resource} via Osmium clearance`,
            mimeType: "application/json"
          },
          extra: {
            assetSymbol: config.asset,
            merchant: config.merchant,
            token: config.token,
            policyContext: config.policyContext
          }
        }
      ]
    };

    return {
      status: 402,
      headers: { "PAYMENT-REQUIRED": encodePaymentRequired(body) },
      body
    };
  }

  async function verifyUnlock(input: {
    paymentId?: string;
    receiptHash?: string;
    policyContext?: string;
  }): Promise<Osmium402UnlockResult> {
    if (!input.paymentId || !input.receiptHash) return { unlocked: false, reason: "MissingReceipt" };
    if (input.policyContext && input.policyContext !== config.policyContext) {
      return { unlocked: false, reason: "ContextMismatch" };
    }

    const response = await fetch(runnerEndpoint(runnerUrl, "/merchant/receipt"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        asset: config.asset,
        paymentId: input.paymentId,
        receiptHash: input.receiptHash
      })
    });

    if (!response.ok) return { unlocked: false, reason: "RunnerDenied" };
    const json = (await response.json()) as { unlocked?: boolean; dataHash?: string };
    if (!json.unlocked) return { unlocked: false, reason: "RunnerDenied" };
    return { unlocked: true, dataHash: json.dataHash };
  }

  return { paymentRequired, verifyUnlock };
}
