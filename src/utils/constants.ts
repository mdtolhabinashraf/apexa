import type { HttpMethod, RetryOptions } from "../types.js";

export const DEFAULT_TIMEOUT = 15_000;
export const DEFAULT_MINIMUM_TIME = 0;
export const DEFAULT_CREDENTIALS: RequestCredentials = "same-origin";

export const DEFAULT_RETRY: Required<RetryOptions> = {
  enabled: false,
  retries: 2,
  delay: 300,
  maxDelay: 5_000,
  backoff: 2,
  statusCodes: [408, 425, 429, 500, 502, 503, 504],
  retryNetworkErrors: true,
};

export const DEFAULT_CSRF = {
  enabled: false,
  cookieName: "csrf-token",
  headerName: "X-CSRF-Token",
  methods: ["POST", "PUT", "PATCH", "DELETE"] as readonly HttpMethod[],
  required: true,
};

export const BODYLESS_METHODS = new Set<HttpMethod>(["GET", "HEAD"]);
export const RETRY_SAFE_METHODS = new Set<HttpMethod>(["GET", "HEAD", "OPTIONS"]);
export const SUPPORTED_METHODS = new Set<HttpMethod>([
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "CONNECT",
  "TRACE",
]);
