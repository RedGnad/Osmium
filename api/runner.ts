import { app } from "../apps/agent-runner/src/server.js";

type VercelLikeRequest = {
  url?: string;
  [key: string]: unknown;
};

type VercelLikeResponse = {
  [key: string]: unknown;
};

export default function handler(request: VercelLikeRequest, response: VercelLikeResponse) {
  const url = new URL(request.url ?? "/api/runner", "https://osmium.local");
  const runnerPath = url.searchParams.get("runnerPath");
  if (!runnerPath) {
    request.url = "/";
    return app(request, response);
  }

  url.searchParams.delete("runnerPath");
  const query = url.searchParams.toString();
  request.url = `/${runnerPath.replace(/^\/+/, "")}${query ? `?${query}` : ""}`;
  return app(request, response);
}
