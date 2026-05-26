import http from "node:http";
import { withOsmium402 } from "../../merchant-kit/src/withOsmium402.js";

const TSLA_ADDRESS =
  (process.env.TSLA_TOKEN_ADDRESS as `0x${string}` | undefined) ??
  "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E";
const MERCHANT_ADDRESS =
  (process.env.MERCHANT_ADDRESS as `0x${string}` | undefined) ??
  "0x0000000000000000000000000000000000000000";

const protectedTslaData = withOsmium402({
  resource: "market-data/TSLA",
  asset: "TSLA",
  price: "0.25",
  token: TSLA_ADDRESS,
  merchant: MERCHANT_ADDRESS,
  policyContext: "robinhood-market-data-v1",
  runnerUrl: process.env.OSMIUM_RUNNER_URL ?? "https://osmium-agent-runner.vercel.app/api/runner"
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost:3012");
  if (url.pathname !== "/market-data/TSLA") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const paymentId = url.searchParams.get("paymentId") ?? undefined;
  const receiptHash = url.searchParams.get("receiptHash") ?? undefined;
  const unlock = await protectedTslaData.verifyUnlock({ paymentId, receiptHash });

  if (!unlock.unlocked) {
    const challenge = protectedTslaData.paymentRequired(url.pathname);
    res.writeHead(challenge.status, {
      "content-type": "application/json",
      ...challenge.headers
    });
    res.end(JSON.stringify(challenge.body));
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

server.listen(3012, () => {
  console.log("TSLA merchant example listening on http://localhost:3012");
});
