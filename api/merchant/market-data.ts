import { invokeRunner } from "../../apps/agent-runner/src/vercelAdapter.js";

export default function handler(request: { url?: string; [key: string]: unknown }, response: { [key: string]: unknown }) {
  return invokeRunner("/merchant/market-data", request, response);
}
