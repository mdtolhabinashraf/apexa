# Apexa API Reference

This reference describes the intended public API exposed by `types.ts` and `index.ts`. Defaults should be kept in sync with the implementation as it evolves.

## Constructor

```ts
new Apexa(config?: ApexaConfig)
```

Creates a client with defaults that can be overridden on each request.

### `ApexaConfig` / `ClientOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | none | Origin/base URL for relative endpoint paths. |
| `basePath` | `string` | `""` | Path prepended to relative endpoint paths. |
| `headers` | `HeadersInit` | empty | Default headers. Request headers are merged by name. |
| `credentials` | `RequestCredentials` | `"same-origin"` | Fetch credentials mode. |
| `timeout` | `number` | `15000` ms | Request timeout; `0` disables it. |
| `minimumTime` | `number` | `0` ms | Minimum elapsed request duration. |
| `cache` | `RequestCache` | Fetch default | Fetch cache mode. |
| `redirect` | `RequestRedirect` | Fetch default | Redirect handling. |
| `referrer` | `string` | Fetch default | Request referrer. |
| `referrerPolicy` | `ReferrerPolicy` | Fetch default | Referrer policy. |
| `integrity` | `string` | none | Subresource integrity metadata. |
| `keepalive` | `boolean` | Fetch default | Keepalive behavior where supported. |
| `mode` | `RequestMode` | Fetch default | Fetch mode. |
| `retry` | `RetryOptions` | disabled | Retry policy. |
| `csrf` | `CsrfOptions` | disabled | CSRF token handling. |
| `metadata` | `RequestMetadata` | empty | Local metadata attached to the request. |
| `adapter` | `HttpAdapter` | `fetchAdapter` | Network transport adapter. |
| `interpreter` | `ResponseInterpreter` | `defaultInterpreter` | Response-body parser. |

Every option above may also be passed to a request. Request-level values override instance defaults.

## Request methods

All request methods resolve to `Promise<ApiResponse<T>>`, except `head`, which resolves to `Promise<ApiResponse<undefined>>`.

```ts
api.request<T>(url, options?)
api.get<T>(url, options?)
api.delete<T>(url, options?)
api.head(url, options?)
api.options<T>(url, options?)
api.post<T>(url, body?, options?)
api.put<T>(url, body?, options?)
api.patch<T>(url, body?, options?)
```

### Request options

| Option | Type | Description |
|---|---|---|
| `method` | `HttpMethod` | HTTP method for `request`; convenience methods set it automatically. |
| `baseUrl` | `string` | Per-request base URL override. |
| `basePath` | `string` | Per-request base path override. |
| `query` | `QueryParams` | Query parameters appended to the URL. |
| `body` | `RequestBody` | Request body; plain objects and arrays are JSON serialized. |
| `headers` | `HeadersInit` | Request-specific headers. |
| `signal` | `AbortSignal` | Caller-controlled cancellation. |
| `timeout` | `number` | Per-request timeout. |
| `minimumTime` | `number` | Per-request minimum duration. |
| `credentials` | `RequestCredentials` | Per-request credentials mode. |
| `cache` | `RequestCache` | Fetch cache mode. |
| `redirect` | `RequestRedirect` | Redirect behavior. |
| `referrer` | `string` | Request referrer. |
| `referrerPolicy` | `ReferrerPolicy` | Referrer policy. |
| `integrity` | `string` | Integrity metadata. |
| `keepalive` | `boolean` | Keepalive setting. |
| `mode` | `RequestMode` | Fetch request mode. |
| `retry` | `RetryOptions` | Retry policy override. |
| `csrf` | `CsrfOptions` | CSRF policy override. |
| `metadata` | `RequestMetadata` | Request metadata. |
| `adapter` | `HttpAdapter` | Request-specific adapter override. |
| `interpreter` | `ResponseInterpreter` | Request-specific parser override. |

Absolute URLs bypass `baseUrl` and `basePath`. Query parameters with `null` or `undefined` values are omitted. Array values are serialized as repeated query keys.

## `ApiResponse<T>`

| Property | Type | Description |
|---|---|---|
| `data` | `T` | Parsed response payload. |
| `raw` | `Response` | Native Fetch response preserved for low-level/manual access. |
| `ok` | `boolean` | Whether the response status is in the successful range (`200`–`299`). |
| `status` | `number` | HTTP status code. |
| `statusText` | `string` | HTTP status text. |
| `headers` | `Headers` | Response headers. |
| `body` | `ReadableStream<Uint8Array> \| null` | Preserved response body stream for low-level streaming access. |
| `redirected` | `boolean` | Whether the Fetch implementation followed one or more redirects. |
| `type` | `ResponseType` | Response type determined by the Fetch implementation. |
| `bodyUsed` | `boolean` | Whether the preserved response body has been consumed. |
| `url` | `string` | Final response URL, falling back to the configured URL. |
| `config` | `InternalRequestConfig` | Effective normalized request configuration. |
| `text()` | `() => Promise<string>` | Read the body as text from a fresh response clone. |
| `json<U>()` | `() => Promise<U>` | Parse the body as JSON from a fresh response clone. |
| `blob()` | `() => Promise<Blob>` | Read the body as a Blob from a fresh response clone. |
| `arrayBuffer()` | `() => Promise<ArrayBuffer>` | Read the body as an ArrayBuffer from a fresh response clone. |
| `formData()` | `() => Promise<FormData>` | Read the body as FormData from a fresh response clone. |
| `clone()` | `() => Response` | Create a native Fetch response clone for manual body handling. |

`T` is a compile-time expectation only. Use a runtime validator for untrusted response data.

The body-reading helpers use independent clones, so calling one does not consume
the response exposed by another helper. The `raw` response is also available
when direct Fetch APIs are required.

## Interceptors

### Request

```ts
const id = api.interceptors.request.use(
  (config) => {
    config.headers.set("X-Trace-Id", crypto.randomUUID());
    return config;
  },
  (error) => {
    throw error;
  },
);

api.interceptors.request.eject(id);
api.interceptors.request.clear();
```

Request interceptors execute in reverse registration order.

### Response

```ts
const id = api.interceptors.response.use(
  (response) => response,
  (error) => {
    throw error;
  },
);

api.interceptors.response.eject(id);
api.interceptors.response.clear();
```

Response interceptors execute in registration order. A rejected interceptor can recover by returning a value, or keep the request rejected by throwing/rejecting.

## Errors

`ApexaError` (also exported as `ApiError`) extends `Error`.

| Property | Type | Description |
|---|---|---|
| `name` | `"ApexaError"` | Error name. |
| `message` | `string` | Human-readable message. |
| `code` | `ApexaErrorCode` | Machine-readable error code. |
| `config` | `InternalRequestConfig \| undefined` | Request context when available. |
| `response` | `ApiResponse<unknown> \| undefined` | Parsed HTTP response when available. |
| `cause` | `unknown` | Original failure, when available. |

Codes defined by the public type:

- `ERR_CONFIG`
- `ERR_NETWORK`
- `ERR_TIMEOUT`
- `ERR_ABORTED`
- `ERR_HTTP`
- `ERR_PARSE`
- `ERR_CSRF`
- `ERR_INTERCEPTOR`
- `ERR_UNKNOWN`

Callers should use `instanceof ApexaError` and inspect `code` instead of parsing error messages.

## `RetryOptions`

| Option | Default | Description |
|---|---:|---|
| `enabled` | `false` | Enable retry handling. |
| `retries` | `2` | Attempts after the first request. |
| `delay` | `300` ms | Initial delay. |
| `maxDelay` | `5000` ms | Delay cap. |
| `backoff` | `2` | Exponential multiplier. |
| `statusCodes` | `408, 425, 429, 500, 502, 503, 504` | Retryable response statuses. |
| `retryNetworkErrors` | `true` when enabled | Retry transport failures. |

Retry behavior must be verified against the actual implementation. Retrying non-idempotent methods can duplicate operations; use idempotency keys and explicit application-level guarantees when needed.

## `CsrfOptions`

| Option | Default | Description |
|---|---|---|
| `enabled` | `false` | Enable CSRF handling. |
| `cookieName` | `"csrf-token"` | Cookie read by the default provider. |
| `headerName` | `"X-CSRF-Token"` | Header used to send the token. |
| `methods` | `POST, PUT, PATCH, DELETE` | Methods protected by default. |
| `tokenProvider` | none | Custom token resolver. |
| `required` | `true` | Fail if a token cannot be found while protection is enabled. |

A JavaScript client cannot read an `HttpOnly` cookie. Use a token provider or server-supported CSRF strategy when required.

## Adapter and interpreter

### `HttpAdapter`

```ts
type HttpAdapter = (
  config: InternalRequestConfig,
) => Promise<Response>;
```

An adapter performs transport and returns a native `Response`.

### `ResponseInterpreter`

```ts
type ResponseInterpreter = (
  response: Response,
  config: InternalRequestConfig,
) => unknown | Promise<unknown>;
```

An interpreter parses the response body. It does not provide runtime schema validation unless explicitly implemented.
