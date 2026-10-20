/**
 * Apexa — configurable, strongly typed HTTP client.
 *
 * @packageDocumentation
 */

import type {
  ApiResponse,
  ApexaConfig,
  ApexaErrorOptions,
  ApexaRequestMethods,
  ClientOptions,
  HttpAdapter,
  HttpMethod,
  InternalRequestConfig,
  InterceptorId,
  RequestBody,
  RequestOptions,
  ResponseInterpreter,
  RetryOptions,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/* Defaults                                                                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MINIMUM_TIME = 0;
const DEFAULT_CREDENTIALS: RequestCredentials = "same-origin";

const DEFAULT_RETRY: Required<RetryOptions> = {
  enabled: false,
  retries: 2,
  delay: 300,
  maxDelay: 5_000,
  backoff: 2,
  statusCodes: [408, 425, 429, 500, 502, 503, 504],
  retryNetworkErrors: true,
};

const DEFAULT_CSRF = {
  enabled: false,
  cookieName: "csrf-token",
  headerName: "X-CSRF-Token",
  methods: ["POST", "PUT", "PATCH", "DELETE"] as readonly HttpMethod[],
  required: true,
};

const BODYLESS_METHODS = new Set<HttpMethod>(["GET", "HEAD"]);
const RETRY_SAFE_METHODS = new Set<HttpMethod>(["GET", "HEAD", "OPTIONS"]);
const SUPPORTED_METHODS = new Set<HttpMethod>([
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

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Standardized error thrown by Apexa.
 *
 * Use `code` for programmatic handling and `response` to inspect an HTTP
 * response when one was received.
 */
export class ApexaError extends Error {
  /** Stable error code. */
  public readonly code: string;

  /** Error priority. */
  public readonly priority: "high" | "medium" | "low";

  /** Request configuration, when available. */
  public readonly config?: InternalRequestConfig;

  /** Parsed response, when available. */
  public readonly response?: ApiResponse<unknown>;

  /**
   * Create an Apexa error.
   *
   * @param message - Human-readable error message.
   * @param options - Error code and optional diagnostic context.
   */
  public constructor(message: string, options: ApexaErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApexaError";
    this.code = options.code;
    this.priority = options.priority ?? "medium";

    if (options.config !== undefined) this.config = options.config;
    if (options.response !== undefined) this.response = options.response;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Alias for applications that prefer the name `ApiError`. */
export { ApexaError as ApiError };

/* -------------------------------------------------------------------------- */
/* Interceptors                                                                */
/* -------------------------------------------------------------------------- */

interface InterceptorHandler<F, R> {
  readonly id: InterceptorId;
  readonly fulfilled?: F;
  readonly rejected?: R;
}

/**
 * Manages registration, removal, and snapshotting of interceptors.
 *
 * Interceptor identifiers remain stable until removed. Removing an interceptor
 * does not alter requests that have already taken their snapshot.
 */
class InterceptorManager<F, R> {
  private handlers: Array<InterceptorHandler<F, R>> = [];
  private nextId = 0;

  /**
   * Register a fulfilled and/or rejected callback.
   *
   * @returns An identifier for later removal with `eject`.
   */
  public use(fulfilled?: F, rejected?: R): InterceptorId {
    const id = this.nextId++;

    this.handlers.push({
      id,
      ...(fulfilled !== undefined ? { fulfilled } : {}),
      ...(rejected !== undefined ? { rejected } : {}),
    });

    return id;
  }

  /** Remove a registered interceptor. Unknown IDs are ignored. */
  public eject(id: InterceptorId): void {
    this.handlers = this.handlers.filter((handler) => handler.id !== id);
  }

  /** Remove all interceptors from this manager. */
  public clear(): void {
    this.handlers = [];
  }

  /** Return a stable snapshot of the current handlers. */
  public snapshot(): ReadonlyArray<InterceptorHandler<F, R>> {
    return [...this.handlers];
  }
}

/**
 * Public request and response interceptor registry.
 *
 * Request interceptors execute in reverse registration order.
 * Response interceptors execute in registration order.
 */
export class InterceptorRegistry {
  /** Request interceptors. */
  public readonly request = new InterceptorManager<
    (
      config: InternalRequestConfig,
    ) => InternalRequestConfig | Promise<InternalRequestConfig>,
    (error: unknown) => unknown
  >();

  /** Response interceptors. */
  public readonly response = new InterceptorManager<
    (
      response: ApiResponse<unknown>,
    ) => ApiResponse<unknown> | Promise<ApiResponse<unknown>>,
    (error: unknown) => unknown
  >();
}

/* -------------------------------------------------------------------------- */
/* Configuration and URL helpers                                              */
/* -------------------------------------------------------------------------- */

function normalizeBasePath(value?: string): string {
  if (!value?.trim()) return "";

  const path = value.trim().replace(/^\/+|\/+$/g, "");
  return path ? `/${path}` : "";
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function isHttpMethod(value: unknown): value is HttpMethod {
  return (
    typeof value === "string" && SUPPORTED_METHODS.has(value as HttpMethod)
  );
}

/**
 * Resolve a request path against the effective base URL and base path.
 * An absolute request URL bypasses both base settings.
 */
function resolveUrl(path: string, baseUrl?: string, basePath = ""): string {
  if (isAbsoluteUrl(path)) return path;

  const cleanPath = path.trim().replace(/^\/+/, "");
  const normalizedBasePath = normalizeBasePath(basePath).replace(/^\/+/, "");
  const relativePath = [normalizedBasePath, cleanPath]
    .filter(Boolean)
    .join("/");

  if (baseUrl === undefined || baseUrl.trim() === "") {
    return `/${relativePath}`;
  }

  try {
    const base = new URL(baseUrl);
    const baseUrlPath = base.pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    const fullPath = [baseUrlPath, relativePath].filter(Boolean).join("/");

    return new URL(`/${fullPath}`, base.origin).toString();
  } catch (cause) {
    throw new ApexaError("Invalid base URL.", {
      code: "ERR_CONFIG",
      cause,
    });
  }
}

function serializeQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;

    if (value instanceof Date) {
      params.append(key, value.toISOString());
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(
          key,
          item instanceof Date ? item.toISOString() : String(item),
        );
      }
      continue;
    }

    params.append(key, String(value));
  }

  return params.toString();
}

function appendQuery(url: string, query?: RequestOptions["query"]): string {
  const serialized = serializeQuery(query);
  if (!serialized) return url;

  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

  return `${withoutHash}${withoutHash.includes("?") ? "&" : "?"}${serialized}${hash}`;
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const result = new Headers();

  for (const source of sources) {
    if (source === undefined) continue;

    new Headers(source).forEach((value, key) => {
      result.set(key, value);
    });
  }

  return result;
}

function mergeRetry(
  defaults?: RetryOptions,
  override?: RetryOptions,
): RetryOptions {
  return {
    ...DEFAULT_RETRY,
    ...defaults,
    ...override,
    statusCodes:
      override?.statusCodes ??
      defaults?.statusCodes ??
      DEFAULT_RETRY.statusCodes,
  };
}

function mergeCsrf(
  defaults?: ClientOptions["csrf"],
  override?: ClientOptions["csrf"],
): NonNullable<ClientOptions["csrf"]> {
  return {
    ...DEFAULT_CSRF,
    ...defaults,
    ...override,
    methods: override?.methods ?? defaults?.methods ?? DEFAULT_CSRF.methods,
  };
}

function validateNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ApexaError(`"${name}" must be a finite, non-negative number.`, {
      code: "ERR_CONFIG",
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function prepareBody(
  body: RequestBody | undefined,
  headers: Headers,
): BodyInit | null | undefined {
  if (body === undefined || body === null) return body;

  if (isPlainObject(body) || Array.isArray(body)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return JSON.stringify(body);
  }

  return body as BodyInit;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!cookie) return undefined;

  const value = cookie.slice(prefix.length);

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
    };

    const abort = (): void => {
      cleanup();
      reject(
        signal?.reason ??
          new DOMException("The request was aborted.", "AbortError"),
      );
    };

    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isErrorPriority(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}

function defaultErrorHandler(
  data: Record<string, unknown>,
  status: number,
): { message: string; code: string; priority: "high" | "medium" | "low" } {
  const error = isRecord(data.error) ? data.error : {};

  return {
    code: typeof error.code === "string" ? error.code : "ERR_HTTP",
    message:
      typeof error.message === "string"
        ? error.message
        : `Request failed with HTTP status ${status}.`,
    priority: isErrorPriority(error.priority) ? error.priority : "medium",
  };
}

type ErrorDetails = ReturnType<typeof defaultErrorHandler>;

function normalizeErrorDetails(value: unknown, status: number): ErrorDetails {
  if (!isRecord(value)) {
    return defaultErrorHandler({}, status);
  }

  return {
    message:
      typeof value.message === "string" && value.message.trim()
        ? value.message
        : `Request failed with HTTP status ${status}.`,
    code:
      typeof value.code === "string" && value.code.trim()
        ? value.code
        : "ERR_HTTP",
    priority: isErrorPriority(value.priority) ? value.priority : "medium",
  };
}

/* -------------------------------------------------------------------------- */
/* Response parsing                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Default response interpreter.
 *
 * JSON content types are parsed as JSON. Other content types are returned
 * as text. Empty and bodyless responses return `undefined`.
 */
export const defaultInterpreter: ResponseInterpreter = async (response) => {
  if (
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    return undefined;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await response.text();

  if (text.length === 0) return undefined;

  if (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {
    try {
      return JSON.parse(text) as unknown;
    } catch (cause) {
      throw new ApexaError("The server returned invalid JSON.", {
        code: "ERR_PARSE",
        cause,
      });
    }
  }

  return text;
};

function toApiResponse<T>(
  data: T,
  response: Response,
  rawResponse: Response,
  config: InternalRequestConfig,
): ApiResponse<T> {
  return {
    data,
    raw: rawResponse,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
    body: rawResponse.body,
    redirected: response.redirected,
    type: response.type,
    bodyUsed: rawResponse.bodyUsed,
    url: response.url || config.url,
    config,
    text: () => rawResponse.clone().text(),
    json: <U = unknown>() => rawResponse.clone().json() as Promise<U>,
    blob: () => rawResponse.clone().blob(),
    arrayBuffer: () => rawResponse.clone().arrayBuffer(),
    formData: () => rawResponse.clone().formData(),
    clone: () => rawResponse.clone(),
  };
}

/* -------------------------------------------------------------------------- */
/* Default Fetch adapter                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Default Fetch-based transport adapter.
 *
 * It sends the normalized request configuration and returns the native
 * `Response`. Response parsing and HTTP status handling are performed by Apexa.
 */
export const fetchAdapter: HttpAdapter = async (config) => {
  if (config.method === "CONNECT" || config.method === "TRACE") {
    throw new ApexaError(
      `Fetch does not support the ${config.method} method.`,
      { code: "ERR_CONFIG", config },
    );
  }

  const headers = new Headers(config.headers);
  const body = prepareBody(config.body, headers);

  if (BODYLESS_METHODS.has(config.method) && body != null) {
    throw new ApexaError(`${config.method} requests cannot include a body.`, {
      code: "ERR_CONFIG",
      config,
    });
  }

  const init: RequestInit = {
    method: config.method,
    headers,
    signal: config.signal,
    credentials: config.credentials,
    ...(body !== undefined ? { body } : {}),
    ...(config.cache !== undefined ? { cache: config.cache } : {}),
    ...(config.redirect !== undefined ? { redirect: config.redirect } : {}),
    ...(config.referrer !== undefined ? { referrer: config.referrer } : {}),
    ...(config.referrerPolicy !== undefined
      ? { referrerPolicy: config.referrerPolicy }
      : {}),
    ...(config.integrity !== undefined ? { integrity: config.integrity } : {}),
    ...(config.keepalive !== undefined ? { keepalive: config.keepalive } : {}),
    ...(config.mode !== undefined ? { mode: config.mode } : {}),
  };

  return fetch(config.url, init);
};

/* -------------------------------------------------------------------------- */
/* Apexa client                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Configurable HTTP client with typed response methods and interceptors.
 *
 * Instance defaults can be overridden on each request, including `baseUrl`
 * and `basePath`.
 *
 * @example
 * ```ts
 * const api = new Apexa({
 *   baseUrl: "https://api.example.com",
 *   basePath: "/api/v1",
 *   timeout: 10_000,
 * });
 *
 * const response = await api.get<User>("/users/123");
 * console.log(response.data);
 *
 * // Override both URL settings for one request.
 * const other = await api.get<User>("/users/123", {
 *   baseUrl: "https://other.example.com",
 *   basePath: "/v2",
 * });
 * ```
 */
export class Apexa implements ApexaRequestMethods {
  /** Request and response interceptors. */
  public readonly interceptors = new InterceptorRegistry();

  private readonly defaults: ApexaConfig;

  /**
   * Create an Apexa instance.
   *
   * @param config - Default options used by requests.
   */
  public constructor(config: ApexaConfig = {}) {
    this.defaults = { ...config };

    validateNonNegative("timeout", config.timeout ?? DEFAULT_TIMEOUT);
    validateNonNegative(
      "minimumTime",
      config.minimumTime ?? DEFAULT_MINIMUM_TIME,
    );
  }

  /**
   * Execute a request using the configured request pipeline.
   *
   * @typeParam T - Expected response data type.
   * @param url - Absolute URL or relative endpoint path.
   * @param options - Per-request overrides.
   * @returns Parsed response and request metadata.
   */
  public async request<T = unknown>(
    url: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const externalSignal = options.signal;

    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let config: InternalRequestConfig | undefined;
    let parsedResponse: ApiResponse<unknown> | undefined;

    const abortFromExternal = (): void => {
      controller.abort(externalSignal?.reason);
    };

    if (externalSignal?.aborted) {
      abortFromExternal();
    } else {
      externalSignal?.addEventListener("abort", abortFromExternal, {
        once: true,
      });
    }

    const timeout = options.timeout ?? this.defaults.timeout ?? DEFAULT_TIMEOUT;

    try {
      validateNonNegative("timeout", timeout);
      validateNonNegative(
        "minimumTime",
        options.minimumTime ??
          this.defaults.minimumTime ??
          DEFAULT_MINIMUM_TIME,
      );

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort(
            new DOMException("The request timed out.", "TimeoutError"),
          );
        }, timeout);
      }

      const requestedMethod =
        typeof options.method === "string"
          ? options.method.toUpperCase()
          : "GET";

      if (!isHttpMethod(requestedMethod)) {
        throw new ApexaError(`Unsupported HTTP method "${requestedMethod}".`, {
          code: "ERR_CONFIG",
        });
      }

      const method = requestedMethod;
      const baseUrl = options.baseUrl ?? this.defaults.baseUrl;
      const basePath = normalizeBasePath(
        options.basePath ?? this.defaults.basePath,
      );
      const resolvedUrl = appendQuery(
        resolveUrl(url, baseUrl, basePath),
        options.query,
      );

      const headers = mergeHeaders(this.defaults.headers, options.headers);
      const metadata = {
        ...this.defaults.metadata,
        ...options.metadata,
      };

      const retry = mergeRetry(this.defaults.retry, options.retry);
      const csrf = mergeCsrf(this.defaults.csrf, options.csrf);

      const rawConfig: InternalRequestConfig = {
        url: resolvedUrl,
        method,
        headers,
        signal: controller.signal,
        basePath,
        credentials:
          options.credentials ??
          this.defaults.credentials ??
          DEFAULT_CREDENTIALS,
        timeout,
        minimumTime:
          options.minimumTime ??
          this.defaults.minimumTime ??
          DEFAULT_MINIMUM_TIME,
        metadata,
        retry,
        csrf,
        ...(options.body !== undefined ? { body: options.body } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...((options.cache ?? this.defaults.cache) !== undefined
          ? { cache: options.cache ?? this.defaults.cache }
          : {}),
        ...((options.redirect ?? this.defaults.redirect) !== undefined
          ? { redirect: options.redirect ?? this.defaults.redirect }
          : {}),
        ...((options.referrer ?? this.defaults.referrer) !== undefined
          ? { referrer: options.referrer ?? this.defaults.referrer }
          : {}),
        ...((options.referrerPolicy ?? this.defaults.referrerPolicy) !==
        undefined
          ? {
              referrerPolicy:
                options.referrerPolicy ?? this.defaults.referrerPolicy,
            }
          : {}),
        ...((options.integrity ?? this.defaults.integrity) !== undefined
          ? { integrity: options.integrity ?? this.defaults.integrity }
          : {}),
        ...((options.keepalive ?? this.defaults.keepalive) !== undefined
          ? { keepalive: options.keepalive ?? this.defaults.keepalive }
          : {}),
        ...((options.mode ?? this.defaults.mode) !== undefined
          ? { mode: options.mode ?? this.defaults.mode }
          : {}),
      };

      config = rawConfig;

      // Request interceptors use a Promise chain so rejection callbacks
      // can recover from a preceding request-interceptor failure.
      let requestChain: Promise<unknown> = Promise.resolve(config);
      const requestHandlers = this.interceptors.request.snapshot();

      for (let index = requestHandlers.length - 1; index >= 0; index -= 1) {
        const handler = requestHandlers[index];
        if (!handler) continue;

        requestChain = requestChain.then(
          handler.fulfilled
            ? (value) => handler.fulfilled?.(value as InternalRequestConfig)
            : undefined,
          handler.rejected ? (error) => handler.rejected?.(error) : undefined,
        );
      }

      config = (await requestChain) as InternalRequestConfig;

      if (
        !config ||
        typeof config.url !== "string" ||
        !isHttpMethod(config.method)
      ) {
        throw new ApexaError(
          "A request interceptor returned an invalid configuration.",
          { code: "ERR_INTERCEPTOR", config },
        );
      }

      if (!(config.headers instanceof Headers)) {
        try {
          config.headers = new Headers(config.headers);
        } catch (cause) {
          throw new ApexaError(
            "A request interceptor returned invalid headers.",
            { code: "ERR_INTERCEPTOR", config, cause },
          );
        }
      }

      await this.applyCsrf(config);

      const adapter = options.adapter ?? this.defaults.adapter ?? fetchAdapter;
      let response: Response;

      try {
        response = await this.performWithRetry(config, adapter);
      } catch (cause) {
        if (cause instanceof ApexaError) throw cause;

        throw new ApexaError("The network request failed.", {
          code: "ERR_NETWORK",
          config,
          cause,
        });
      }

      const rawResponse = response.clone();

      const interpreter =
        options.interpreter ?? this.defaults.interpreter ?? defaultInterpreter;

      let data: unknown;

      try {
        data = await interpreter(response, config);
      } catch (cause) {
        if (cause instanceof ApexaError && cause.code === "ERR_PARSE") {
          throw new ApexaError(cause.message, {
            code: "ERR_PARSE",
            config,
            cause,
          });
        }

        throw new ApexaError("Failed to parse the server response.", {
          code: "ERR_PARSE",
          config,
          cause,
        });
      }

      parsedResponse = toApiResponse(data, response, rawResponse, config);

      if (!response.ok) {
        const responseData = isRecord(parsedResponse.data)
          ? parsedResponse.data
          : {};
        const errorHandler = options.errorHandler ?? this.defaults.errorHandler;
        let handledError: ErrorDetails;

        try {
          handledError = normalizeErrorDetails(
            errorHandler?.(responseData) ??
              defaultErrorHandler(responseData, response.status),
            response.status,
          );
        } catch (cause) {
          throw new ApexaError(
            "The configured error handler failed to process the response.",
            {
              code: "ERR_HTTP",
              config,
              response: parsedResponse,
              cause,
            },
          );
        }

        throw new ApexaError(handledError.message, {
          code: handledError.code,
          priority: handledError.priority,
          config,
          response: parsedResponse,
        });
      }

      const elapsed = Date.now() - startedAt;
      const remaining = config.minimumTime - elapsed;

      if (remaining > 0) await sleep(remaining);
    } catch (originalError) {
      let error: unknown = originalError;

      if (originalError instanceof ApexaError) {
        error = originalError;
      } else if (timedOut) {
        error = new ApexaError("The request timed out.", {
          code: "ERR_TIMEOUT",
          ...(config !== undefined ? { config } : {}),
          cause: originalError,
        });
      } else if (
        externalSignal?.aborted ||
        isAbortError(originalError) ||
        controller.signal.aborted
      ) {
        error = new ApexaError("The request was aborted.", {
          code: "ERR_ABORTED",
          ...(config !== undefined ? { config } : {}),
          cause: originalError,
        });
      } else if (config === undefined) {
        error = new ApexaError("Request configuration failed.", {
          code: "ERR_CONFIG",
          cause: originalError,
        });
      } else {
        error = new ApexaError("The request pipeline failed.", {
          code: "ERR_UNKNOWN",
          config,
          cause: originalError,
        });
      }

      return (await this.runResponseRejectionChain(error)) as ApiResponse<T>;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }

    // Keep response fulfillment outside the catch block so an exception
    // thrown by a fulfilled response interceptor is not processed twice.
    return (await this.runResponseFulfillmentChain(
      parsedResponse as ApiResponse<unknown>,
    )) as ApiResponse<T>;
  }

  /** Execute a GET request. */
  public get<T = unknown>(
    url: string,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...options, method: "GET" });
  }

  /** Execute a DELETE request. */
  public delete<T = unknown>(
    url: string,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...options, method: "DELETE" });
  }

  /** Execute a HEAD request. */
  public head(
    url: string,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<ApiResponse<undefined>> {
    return this.request<undefined>(url, { ...options, method: "HEAD" });
  }

  /** Execute an OPTIONS request. */
  public options<T = unknown>(
    url: string,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...options, method: "OPTIONS" });
  }

  /** Execute a POST request. */
  public post<T = unknown>(
    url: string,
    body?: RequestBody,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: "POST",
      ...(body !== undefined ? { body } : {}),
    });
  }

  /** Execute a PUT request. */
  public put<T = unknown>(
    url: string,
    body?: RequestBody,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: "PUT",
      ...(body !== undefined ? { body } : {}),
    });
  }

  /** Execute a PATCH request. */
  public patch<T = unknown>(
    url: string,
    body?: RequestBody,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: "PATCH",
      ...(body !== undefined ? { body } : {}),
    });
  }

  private async applyCsrf(config: InternalRequestConfig): Promise<void> {
    const csrf = config.csrf;

    if (!csrf.enabled || !csrf.methods?.includes(config.method)) return;

    let token: string | null | undefined;

    if (csrf.tokenProvider) {
      token = await csrf.tokenProvider();
    } else {
      token = readCookie(csrf.cookieName ?? DEFAULT_CSRF.cookieName);
    }

    if (token) {
      config.headers.set(csrf.headerName ?? DEFAULT_CSRF.headerName, token);
      return;
    }

    if (csrf.required !== false) {
      throw new ApexaError(
        "CSRF protection is enabled, but no token could be resolved.",
        { code: "ERR_CSRF", config },
      );
    }
  }

  private async performWithRetry(
    config: InternalRequestConfig,
    adapter: HttpAdapter,
  ): Promise<Response> {
    const retry = config.retry;
    const maxRetries =
      retry.enabled === true ? Math.max(0, retry.retries ?? 0) : 0;
    const delay = Math.max(0, retry.delay ?? 0);
    const maxDelay = Math.max(delay, retry.maxDelay ?? delay);
    const backoff = Math.max(1, retry.backoff ?? 1);
    const statuses = new Set<number>(
      retry.statusCodes ?? DEFAULT_RETRY.statusCodes,
    );

    // Do not automatically retry unsafe methods, even if retries are enabled.
    const retryMethodAllowed = RETRY_SAFE_METHODS.has(config.method);

    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await adapter(config);

        if (
          retryMethodAllowed &&
          attempt < maxRetries &&
          statuses.has(response.status)
        ) {
          const retryAfter = response.headers.get("retry-after");
          const retryAfterMs =
            retryAfter && /^\d+$/.test(retryAfter)
              ? Number(retryAfter) * 1_000
              : 0;

          await response.body?.cancel().catch(() => undefined);

          const backoffMs = Math.min(maxDelay, delay * backoff ** attempt);
          await sleep(
            Math.min(maxDelay, Math.max(backoffMs, retryAfterMs)),
            config.signal,
          );
          continue;
        }

        return response;
      } catch (error) {
        if (
          !retryMethodAllowed ||
          attempt >= maxRetries ||
          retry.retryNetworkErrors === false ||
          config.signal.aborted
        ) {
          throw error;
        }

        await sleep(
          Math.min(maxDelay, delay * backoff ** attempt),
          config.signal,
        );
      }
    }
  }

  private async runResponseFulfillmentChain(
    initialResponse: ApiResponse<unknown>,
  ): Promise<ApiResponse<unknown>> {
    let chain: Promise<unknown> = Promise.resolve(initialResponse);

    for (const handler of this.interceptors.response.snapshot()) {
      chain = chain.then(
        handler.fulfilled
          ? (value) => handler.fulfilled?.(value as ApiResponse<unknown>)
          : undefined,
      );
    }

    return (await chain) as ApiResponse<unknown>;
  }

  private async runResponseRejectionChain(
    initialError: unknown,
  ): Promise<unknown> {
    let chain: Promise<unknown> = Promise.reject(initialError);

    for (const handler of this.interceptors.response.snapshot()) {
      chain = chain.then(
        undefined,
        handler.rejected ? (error) => handler.rejected?.(error) : undefined,
      );
    }

    return chain;
  }
}

/** Default export for convenient imports. */
export default Apexa;

/** Re-export the public types from the package entry point. */
export type {
  ApiResponse,
  ApexaConfig,
  ApexaErrorOptions,
  ApexaRequestMethods,
  ClientOptions,
  CsrfOptions,
  CredentialsMode,
  FetchOptions,
  HttpAdapter,
  HttpMethod,
  InternalRequestConfig,
  InterceptorId,
  QueryParams,
  QueryScalar,
  QueryValue,
  RequestBody,
  RequestMetadata,
  RequestOptions,
  ResponseInterpreter,
  RetryOptions,
  RetryStatus,
} from "./types.js";
