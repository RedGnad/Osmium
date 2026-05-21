import { app } from "./server.js";

type VercelLikeRequest = {
  url?: string;
  [key: string]: unknown;
};

type VercelLikeResponse = {
  [key: string]: unknown;
};

export function invokeRunner(path: string, request: VercelLikeRequest, response: VercelLikeResponse) {
  const originalUrl = request.url ?? path;
  const query = originalUrl.includes("?") ? originalUrl.slice(originalUrl.indexOf("?")) : "";
  request.url = `${path}${query}`;
  return app(request, response);
}
