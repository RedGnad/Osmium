import { invokeRunner } from "../../apps/agent-runner/src/vercelAdapter.js";

export default function handler(request: { url?: string; [key: string]: unknown }, response: { [key: string]: unknown }) {
  return invokeRunner("/demo/operator-token", request, response);
}
