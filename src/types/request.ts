import type {
  CredentialsMode,
  FetchOptions,
  HttpMethod,
  QueryParams,
  RequestBody,
  RequestMetadata,
} from "./http.js";
import type { CsrfOptions, RetryOptions } from "./policies.js";
import type { ErrorConstructor, ErrorPolicy } from "./errors.js";

export interface ApexaOptions extends FetchOptions {
  baseUrl?: string;
  basePath?: string;
  headers?: HeadersInit;
  credentials?: CredentialsMode;
  timeout?: number;
  minimumTime?: number;
  retry?: RetryOptions;
  csrf?: CsrfOptions;
  metadata?: RequestMetadata;
  adapter?: HttpAdapter;
  interpreter?: ResponseInterpreter;
  error?: ErrorPolicy;
}

export interface ApexaRequestOptions extends ApexaOptions {
  method?: HttpMethod;
  query?: QueryParams;
  body?: RequestBody;
  signal?: AbortSignal;
}

export interface InternalRequestConfig {
  url: string;
  method: HttpMethod;
  headers: Headers;
  signal: AbortSignal;
  body?: RequestBody;
  baseUrl?: string;
  basePath: string;
  credentials: CredentialsMode;
  timeout: number;
  minimumTime: number;
  metadata: Record<string, unknown>;
  retry: RetryOptions;
  csrf: CsrfOptions;
  customError: ErrorConstructor;
  cache?: RequestCache;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  integrity?: string;
  keepalive?: boolean;
  mode?: RequestMode;
}

export type HttpAdapter = (config: InternalRequestConfig) => Promise<Response>;

export type ResponseInterpreter = (
  response: Response,
  config: InternalRequestConfig,
) => unknown | Promise<unknown>;
