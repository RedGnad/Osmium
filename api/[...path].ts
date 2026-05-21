import { app } from "../apps/agent-runner/src/server.js";

type VercelLikeRequest = {
  url?: string;
  [key: string]: unknown;
};

type VercelLikeResponse = {
  [key: string]: unknown;
};

export default function handler(
  request: VercelLikeRequest,
  response: VercelLikeResponse,
) {
  const originalUrl = request.url ?? "/";
  request.url = originalUrl.replace(/^\/api(?=\/|$)/, "") || "/";
  return app(request, response);
}
