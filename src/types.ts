/**
 * Apexa HTTP client — public and internal type definitions.
 *
 * @packageDocumentation
 */

/** Supported HTTP methods. */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

/** A supported scalar query parameter value. */
export type QueryScalar = string | number | boolean | bigint | Date;

/** A query parameter value, including arrays and nullable values. */
export type QueryValue =
  | QueryScalar
  | readonly QueryScalar[]
  | null
  | undefined;

/** Query parameters serialized into a URL. */
export type QueryParams = Readonly<Record<string, QueryValue>>;

/**
 * Request bodies supported by Apexa.
 *
 * Plain objects and arrays are JSON-serialized. Other BodyInit values
 * are passed to the configured adapter without JSON serialization.
 */
export type RequestBody =
  | BodyInit
  | Readonly<Record<string, unknown>>
  | readonly unknown[]
  | null;

/** Arbitrary request metadata that is not sent as HTTP headers. */
export type RequestMetadata = Readonly<Record<string, unknown>>;

/** HTTP status codes eligible for retry. */
export type RetryStatus = 408 | 425 | 429 | 500 | 502 | 503 | 504;

/** Retry policy for transient request failures. */
export interface RetryOptions {
  /** Enable retry handling. Defaults to false. */
  enabled?: boolean;

  /** Number of attempts after the initial attempt. Defaults to 2. */
  retries?: number;

  /** Initial retry delay in milliseconds. Defaults to 300. */
  delay?: number;

  /** Maximum retry delay in milliseconds. Defaults to 5,000. */
  maxDelay?: number;

  /** Exponential backoff multiplier. Defaults to 2. */
  backoff?: number;

  /** HTTP response statuses eligible for retry. */
  statusCodes?: readonly RetryStatus[];

  /** Retry transport errors. Defaults to true when retries are enabled. */
  retryNetworkErrors?: boolean;
}

/** CSRF protection settings. */
export interface CsrfOptions {
  /** Enable CSRF handling. Defaults to false. */
  enabled?: boolean;

  /** Cookie containing the CSRF token. Defaults to "csrf-token". */
  cookieName?: string;

  /** Request header used for the token. Defaults to "X-CSRF-Token". */
  headerName?: string;

  /** HTTP methods that require CSRF protection. */
  methods?: readonly HttpMethod[];

  /** Resolve the token from an application-specific source. */
  tokenProvider?: () =>
    | string
    | null
    | undefined
    | Promise<string | null | undefined>;

  /** Fail if a token cannot be resolved. Defaults to true. */
  required?: boolean;
}

/** Request credentials mode supported by Fetch. */
export type CredentialsMode = RequestCredentials;

/** Fetch options that can be configured on the client or a request. */
export interface FetchOptions {
  /** Fetch cache mode. */
  cache?: RequestCache;

  /** Fetch redirect behavior. */
  redirect?: RequestRedirect;

  /** Request referrer. */
  referrer?: string;

  /** Request referrer policy. */
  referrerPolicy?: ReferrerPolicy;

  /** Request integrity metadata. */
  integrity?: string;

  /** Allow the request to outlive its initiating page when supported. */
  keepalive?: boolean;

  /** Fetch request mode. */
  mode?: RequestMode;
}

/**
 * Common options available on both the instance and individual requests.
 *
 * Request-level values override instance-level values.
 */
export interface ClientOptions extends FetchOptions {
  /** Base URL, such as "https://api.example.com". */
  baseUrl?: string;

  /** Base path prepended to relative endpoints, such as "/api/v1". */
  basePath?: string;

  /** Default or additional HTTP headers. */
  headers?: HeadersInit;

  /** Request credentials mode. Defaults to "same-origin". */
  credentials?: CredentialsMode;

  /** Timeout in milliseconds. Defaults to 15,000; zero disables it. */
  timeout?: number;

  /** Minimum total request duration in milliseconds. Defaults to zero. */
  minimumTime?: number;

  /** Default retry policy. */
  retry?: RetryOptions;

  /** Default CSRF policy. */
  csrf?: CsrfOptions;

  /** Metadata merged with request-specific metadata. */
  metadata?: RequestMetadata;

  /** Custom network adapter. */
  adapter?: HttpAdapter;

  /** Custom response-body interpreter. */
  interpreter?: ResponseInterpreter;
}

/** Options passed to the Apexa constructor. */
export interface ApexaConfig extends ClientOptions {}

/** Options that can override instance defaults for one request. */
export interface RequestOptions extends ClientOptions {
  /** HTTP method. Defaults to GET when using request(). */
  method?: HttpMethod;

  /** Query parameters appended to the request URL. */
  query?: QueryParams;

  /** Request body. Objects and arrays are serialized as JSON. */
  body?: RequestBody;

  /** AbortSignal for caller-controlled cancellation. */
  signal?: AbortSignal;
}

/**
 * Fully normalized request configuration passed to request interceptors
 * and the adapter.
 *
 * Optional properties are omitted when absent to support
 * `exactOptionalPropertyTypes`.
 */
export interface InternalRequestConfig {
  /** Fully resolved URL, including query parameters. */
  url: string;

  /** Normalized HTTP method. */
  method: HttpMethod;

  /** Normalized, mutable request headers. */
  headers: Headers;

  /** Active request cancellation signal. */
  signal: AbortSignal;

  /** Request body, if supplied. */
  body?: RequestBody;

  /** Effective base URL, if configured. */
  baseUrl?: string;

  /** Effective normalized base path. */
  basePath: string;

  /** Effective credentials mode. */
  credentials: CredentialsMode;

  /** Effective timeout in milliseconds. */
  timeout: number;

  /** Effective minimum duration in milliseconds. */
  minimumTime: number;

  /** Effective metadata. */
  metadata: Record<string, unknown>;

  /** Effective retry policy. */
  retry: RetryOptions;

  /** Effective CSRF policy. */
  csrf: CsrfOptions;

  /** Effective Fetch cache mode. */
  cache?: RequestCache;

  /** Effective Fetch redirect mode. */
  redirect?: RequestRedirect;

  /** Effective Fetch referrer. */
  referrer?: string;

  /** Effective Fetch referrer policy. */
  referrerPolicy?: ReferrerPolicy;

  /** Effective Fetch integrity metadata. */
  integrity?: string;

  /** Effective Fetch keepalive setting. */
  keepalive?: boolean;

  /** Effective Fetch mode. */
  mode?: RequestMode;
}

/** Parsed HTTP response returned by Apexa methods. */
export interface ApiResponse<T = unknown> {
  /** Parsed response payload. */
  data: T;

  /** HTTP status code. */
  status: number;

  /** HTTP status text. */
  statusText: string;

  /** Response headers. */
  headers: Headers;

  /** Final response URL. */
  url: string;

  /** Effective request configuration. */
  config: InternalRequestConfig;
}

/** Adapter responsible for performing the network request. */
export type HttpAdapter = (config: InternalRequestConfig) => Promise<Response>;

/**
 * Response interpreter responsible for parsing a response body.
 *
 * The generic type passed to `get<T>()` is a compile-time expectation;
 * runtime validation must be performed separately when required.
 */
export type ResponseInterpreter = (
  response: Response,
  config: InternalRequestConfig,
) => unknown | Promise<unknown>;

/** Request interceptor callback. */
export type RequestFulfilledInterceptor = (
  config: InternalRequestConfig,
) => InternalRequestConfig | Promise<InternalRequestConfig>;

/** Request interceptor rejection callback. */
export type RequestRejectedInterceptor = (error: unknown) => unknown;

/** Response interceptor callback. */
export type ResponseFulfilledInterceptor = (
  response: ApiResponse<unknown>,
) => ApiResponse<unknown> | Promise<ApiResponse<unknown>>;

/** Response interceptor rejection callback. */
export type ResponseRejectedInterceptor = (error: unknown) => unknown;

/** Identifier returned when registering an interceptor. */
export type InterceptorId = number;

/** Stable machine-readable Apexa error codes. */
export type ApexaErrorCode =
  | "ERR_CONFIG"
  | "ERR_NETWORK"
  | "ERR_TIMEOUT"
  | "ERR_ABORTED"
  | "ERR_HTTP"
  | "ERR_PARSE"
  | "ERR_CSRF"
  | "ERR_INTERCEPTOR"
  | "ERR_UNKNOWN";

/** Context supplied when constructing an Apexa error. */
export interface ApexaErrorOptions {
  /** Stable machine-readable error code. */
  code: ApexaErrorCode;

  /** Effective request configuration, if available. */
  config?: InternalRequestConfig;

  /** Parsed HTTP response, if available. */
  response?: ApiResponse<unknown>;

  /** Original error. */
  cause?: unknown;
}

/** Public request methods exposed by the Apexa class. */
export interface ApexaRequestMethods {
  get<T = unknown>(
    url: string,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<ApiResponse<T>>;

  delete<T = unknown>(
    url: string,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<ApiResponse<T>>;

  head(
    url: string,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<ApiResponse<undefined>>;

  options<T = unknown>(
    url: string,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<ApiResponse<T>>;

  post<T = unknown>(
    url: string,
    body?: RequestBody,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<ApiResponse<T>>;

  put<T = unknown>(
    url: string,
    body?: RequestBody,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<ApiResponse<T>>;

  patch<T = unknown>(
    url: string,
    body?: RequestBody,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<ApiResponse<T>>;
}
