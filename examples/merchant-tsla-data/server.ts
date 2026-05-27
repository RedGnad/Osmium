import http from "node:http";
import { withOsmium402 } from "../../merchant-kit/src/withOsmium402.js";

export type MerchantServerOptions = {
  runnerUrl?: string;
  merchantAddress?: `0x${string}`;
  tslaAddress?: `0x${string}`;
};

export function createTslaMerchantServer(options: MerchantServerOptions = {}) {
  const tslaAddress =
    options.tslaAddress ??
    (process.env.TSLA_ADDRESS as `0x${string}` | undefined) ??
    (process.env.TSLA_TOKEN_ADDRESS as `0x${string}` | undefined) ??
    "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E";
  const merchantAddress =
    options.merchantAddress ??
    (process.env.MERCHANT_ADDRESS as `0x${string}` | undefined) ??
    "0x000000000000000000000000000000000000beef";
  const runnerUrl =
    options.runnerUrl ?? process.env.OSMIUM_RUNNER_URL ?? "https://osmium-agent-runner.vercel.app/api/runner";

  const protectedTslaData = withOsmium402({
    resource: "market-data/TSLA",
    asset: "TSLA",
    price: "0.25",
    token: tslaAddress,
    merchant: merchantAddress,
    policyContext: "robinhood-market-data-v1",
    runnerUrl
  });

  return http.createServer(async (req, res) => {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (url.pathname !== "/market-data/TSLA") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const paymentId = url.searchParams.get("paymentId") ?? undefined;
    const receiptHash = url.searchParams.get("receiptHash") ?? undefined;
    const policyContext = url.searchParams.get("policyContext") ?? undefined;
    const unlock = await protectedTslaData.verifyUnlock({ paymentId, receiptHash, policyContext });

    if (!unlock.unlocked) {
      const challenge = protectedTslaData.paymentRequired(url.pathname);
      res.writeHead(challenge.status, {
        "content-type": "application/json",
        ...challenge.headers
      });
      res.end(JSON.stringify({ ...challenge.body, unlockReason: unlock.reason }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        symbol: "TSLA",
        snapshot: "verified market-data payload",
        unlocked: true,
        dataHash: unlock.dataHash
      })
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? "3012");
  const server = createTslaMerchantServer();
  server.listen(port, () => {
    console.log(`TSLA merchant example listening on http://localhost:${port}`);
  });
}
