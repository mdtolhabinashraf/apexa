/**
 * Apexa — configurable, strongly typed HTTP client.
 *
 * @packageDocumentation
 */

import type {
  ApexaResponse,
  ApexaRequestMethods,
  ApexaOptions,
  HttpAdapter,
  InternalRequestConfig,
  RequestBody,
  ApexaRequestOptions,
  ErrorConstructor,
} from "../types.js";
import {
  DEFAULT_CREDENTIALS,
  DEFAULT_MINIMUM_TIME,
  DEFAULT_TIMEOUT,
  DEFAULT_RETRY,
  DEFAULT_CSRF,
  RETRY_SAFE_METHODS,
} from "./constants.js";
import {
  ApexaError,
  defaultErrorHandler,
  type ErrorDetails,
  isRecord,
  normalizeErrorDetails,
} from "./errors.js";
import { InterceptorRegistry } from "./interceptors.js";
import { appendQuery, isHttpMethod, normalizeBasePath, resolveUrl } from "./url.js";
import { mergeCsrf, mergeHeaders, mergeRetry } from "./merge-options.js";
import { validateNonNegative } from "./validation.js";
import { isAbortError, sleep } from "./timing.js";
import { readCookie } from "./browser.js";
import { defaultInterpreter, toApexaResponse } from "./response.js";
import { fetchAdapter } from "./transport.js";

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

  private readonly defaults: ApexaOptions;

  /**
   * Create an Apexa instance.
   *
   * @param config - Default options used by requests.
   */
  public constructor(config: ApexaOptions = {}) {
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
    options: ApexaRequestOptions = {},
  ): Promise<ApexaResponse<T>> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const externalSignal = options.signal;

    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let config: InternalRequestConfig | undefined;
    let parsedResponse: ApexaResponse<unknown> | undefined;

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
        customError:
          options.error?.customError ??
          this.defaults.error?.customError ??
          ApexaError,
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
        if (config.signal.aborted) throw cause;
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

      parsedResponse = toApexaResponse(data, response, rawResponse, config);

      if (!response.ok) {
        const responseData = isRecord(parsedResponse.data)
          ? parsedResponse.data
          : {};
        const errorHandler =
          options.error?.handler ?? this.defaults.error?.handler;
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
        error = this.toPublicError(
          originalError,
          options.error?.customError ?? this.defaults.error?.customError,
        );
      } else if (timedOut) {
        error = this.toPublicError(new ApexaError("The request timed out.", {
          code: "ERR_TIMEOUT",
          ...(config !== undefined ? { config } : {}),
          cause: originalError,
        }), options.error?.customError ?? this.defaults.error?.customError);
      } else if (
        externalSignal?.aborted ||
        isAbortError(originalError) ||
        controller.signal.aborted
      ) {
        error = this.toPublicError(new ApexaError("The request was aborted.", {
          code: "ERR_ABORTED",
          ...(config !== undefined ? { config } : {}),
          cause: originalError,
        }), options.error?.customError ?? this.defaults.error?.customError);
      } else if (config === undefined) {
        error = this.toPublicError(new ApexaError("Request configuration failed.", {
          code: "ERR_CONFIG",
          cause: originalError,
        }), options.error?.customError ?? this.defaults.error?.customError);
      } else {
        error = this.toPublicError(new ApexaError("The request pipeline failed.", {
          code: "ERR_UNKNOWN",
          config,
          cause: originalError,
        }), options.error?.customError ?? this.defaults.error?.customError);
      }

      return (await this.runResponseRejectionChain(error)) as ApexaResponse<T>;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }

    // Keep response fulfillment outside the catch block so an exception
    // thrown by a fulfilled response interceptor is not processed twice.
    return (await this.runResponseFulfillmentChain(
      parsedResponse as ApexaResponse<unknown>,
    )) as ApexaResponse<T>;
  }

  /** Execute a GET request. */
  public get<T = unknown>(
    url: string,
    options: Omit<ApexaRequestOptions, "method" | "body"> = {},
  ): Promise<ApexaResponse<T>> {
    return this.request<T>(url, { ...options, method: "GET" });
  }

  /** Execute a DELETE request. */
  public delete<T = unknown>(
    url: string,
    options: Omit<ApexaRequestOptions, "method" | "body"> = {},
  ): Promise<ApexaResponse<T>> {
    return this.request<T>(url, { ...options, method: "DELETE" });
  }

  /** Execute a HEAD request. */
  public head(
    url: string,
    options: Omit<ApexaRequestOptions, "method" | "body"> = {},
  ): Promise<ApexaResponse<undefined>> {
    return this.request<undefined>(url, { ...options, method: "HEAD" });
  }

  /** Execute an OPTIONS request. */
  public options<T = unknown>(
    url: string,
    options: Omit<ApexaRequestOptions, "method" | "body"> = {},
  ): Promise<ApexaResponse<T>> {
    return this.request<T>(url, { ...options, method: "OPTIONS" });
  }

  /** Execute a POST request. */
  public post<T = unknown>(
    url: string,
    body?: RequestBody,
    options: Omit<ApexaRequestOptions, "method" | "body"> = {},
  ): Promise<ApexaResponse<T>> {
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
    options: Omit<ApexaRequestOptions, "method" | "body"> = {},
  ): Promise<ApexaResponse<T>> {
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
    options: Omit<ApexaRequestOptions, "method" | "body"> = {},
  ): Promise<ApexaResponse<T>> {
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

  private toPublicError(
    error: ApexaError,
    customError: ErrorConstructor | undefined,
  ): Error {
    if (customError === undefined || customError === ApexaError) return error;
    return new customError(error.message, {
      code: error.code,
      priority: error.priority,
      ...(error.config !== undefined ? { config: error.config } : {}),
      ...(error.response !== undefined ? { response: error.response } : {}),
      ...(error.cause !== undefined ? { cause: error.cause } : {}),
    });
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
    initialResponse: ApexaResponse<unknown>,
  ): Promise<ApexaResponse<unknown>> {
    let chain: Promise<unknown> = Promise.resolve(initialResponse);

    for (const handler of this.interceptors.response.snapshot()) {
      chain = chain.then(
        handler.fulfilled
          ? (value) => handler.fulfilled?.(value as ApexaResponse<unknown>)
          : undefined,
      );
    }

    return (await chain) as ApexaResponse<unknown>;
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

export default Apexa;
