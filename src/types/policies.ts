import type { HttpMethod } from "./http.js";

export type RetryStatus = 408 | 425 | 429 | 500 | 502 | 503 | 504;

export interface RetryOptions {
  enabled?: boolean;
  retries?: number;
  delay?: number;
  maxDelay?: number;
  backoff?: number;
  statusCodes?: readonly RetryStatus[];
  retryNetworkErrors?: boolean;
}

export interface CsrfOptions {
  enabled?: boolean;
  cookieName?: string;
  headerName?: string;
  methods?: readonly HttpMethod[];
  tokenProvider?: () =>
    | string
    | null
    | undefined
    | Promise<string | null | undefined>;
  required?: boolean;
}
