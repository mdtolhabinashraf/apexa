# Apexa API Reference

Apexa is a TypeScript-first HTTP client built on the platform Fetch API. It
provides a single request pipeline for URL construction, headers, body
serialization, retries, CSRF protection, interceptors, response parsing, and
typed errors.

This reference documents Apexa `v2.0.0`.

- [Installation](#installation)
- [Quick start](#quick-start)
- [Exports](#exports)
- [Client](#client)
- [Request options](#request-options)
- [Response](#response)
- [Errors](#errors)
- [Interceptors](#interceptors)
- [Retries](#retries)
- [CSRF protection](#csrf-protection)
- [Adapters and interpreters](#adapters-and-interpreters)
- [Type reference](#type-reference)

## Installation

### npm

```bash
npm install apexa
```

### pnpm

```bash
pnpm add apexa
```

### Yarn

```bash
yarn add apexa
```

### Bun

```bash
bun add apexa
```

Each command installs the Apexa package.

Apexa requires Node.js 20 or newer when used in Node.js. Modern browsers with
the Fetch API and standard Web API types are supported.

## Quick start

```ts
import Apexa from "apexa";

interface User {
  id: string;
  name: string;
}

const api = new Apexa({
  baseUrl: "https://api.example.com",
  basePath: "/v1",
  timeout: 15_000,
});

const response = await api.get<User>("/users/123");
console.log(response.data.name);
```

For a named import:

```ts
import { Apexa } from "apexa";
```

## Exports

The package root exports:

- `Apexa` and the default `Apexa` export
- `ApexaError`
- `InterceptorRegistry`
- `defaultInterpreter`
- `fetchAdapter`
- All public TypeScript types

Types are also available from the `apexa/types` subpath:

```ts
import type { ApexaOptions, ApexaResponse } from "apexa/types";
```

## Client

### `new Apexa(options?)`

Creates a client with reusable request defaults.

```ts
const api = new Apexa({
  baseUrl: "https://api.example.com",
  headers: {
    Accept: "application/json",
  },
  credentials: "same-origin",
});
```

The constructor validates `timeout` and `minimumTime`. Both must be finite,
non-negative numbers.

### Request methods

All methods return `Promise<ApexaResponse<T>>`, except that `head` is typed as
`Promise<ApexaResponse<undefined>>`.

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

Examples:

```ts
await api.get<User[]>("/users", {
  query: { page: 2, active: true },
});

await api.post<User>("/users", {
  name: "Ada",
});
```

Convenience methods set their HTTP method and prevent callers from overriding
`method` or `body` through their options type.

## Request options

`ApexaOptions` can be supplied to the constructor. `ApexaRequestOptions`
contains the same options plus request-specific `method`, `query`, `body`, and
`signal` fields. Request options override instance defaults.

| Option | Type | Description |
| --- | --- | --- |
| `baseUrl` | `string` | Origin and optional path used for relative URLs. |
| `basePath` | `string` | Path prefix appended after `baseUrl`. |
| `headers` | `HeadersInit` | Default or per-request headers. Later values replace earlier values. |
| `credentials` | `RequestCredentials` | Fetch credentials mode. Defaults to `same-origin`. |
| `timeout` | `number` | Abort the request after this many milliseconds. `0` disables the timer. Default: `15000`. |
| `minimumTime` | `number` | Ensure the request pipeline takes at least this many milliseconds. Default: `0`. |
| `query` | `QueryParams` | Query values appended to the URL. |
| `body` | `RequestBody` | Request payload. Plain objects and arrays are JSON serialized. |
| `signal` | `AbortSignal` | External cancellation signal. |
| `cache` | `RequestCache` | Fetch cache mode. |
| `redirect` | `RequestRedirect` | Fetch redirect mode. |
| `referrer` | `string` | Fetch referrer. |
| `referrerPolicy` | `ReferrerPolicy` | Fetch referrer policy. |
| `integrity` | `string` | Fetch subresource integrity metadata. |
| `keepalive` | `boolean` | Fetch keepalive flag. |
| `mode` | `RequestMode` | Fetch request mode. |
| `metadata` | `RequestMetadata` | Application metadata passed to adapters and interceptors. |
| `adapter` | `HttpAdapter` | Custom function that executes the request. |
| `interpreter` | `ResponseInterpreter` | Custom function that parses a native response. |
| `retry` | `RetryOptions` | Retry policy for safe methods. |
| `csrf` | `CsrfOptions` | CSRF token policy. |
| `error` | `ErrorPolicy` | HTTP error mapping and custom error constructor. |

### URLs and query parameters

Absolute URLs are used unchanged. Relative URLs are resolved against
`baseUrl` and `basePath`. Query values support strings, numbers, booleans,
bigints, dates, arrays, `null`, and `undefined`. `null` and `undefined` are
omitted; array values are repeated:

```ts
await api.get("/events#recent", {
  query: {
    from: new Date("2026-01-01T00:00:00.000Z"),
    tag: ["api", "http"],
    archived: false,
  },
});
```

### Request bodies

Plain objects and arrays are serialized with `JSON.stringify`. If no
`Content-Type` header is present, Apexa sets it to `application/json`.
Strings, `Blob`, `FormData`, `URLSearchParams`, `ArrayBuffer`, streams, and
other Fetch-compatible body values are passed to Fetch unchanged.

`GET` and `HEAD` requests cannot include a body. `CONNECT` and `TRACE` are
rejected because they are not supported by the Fetch API.

## Response

`ApexaResponse<T>` combines parsed data with native Fetch metadata:

| Property | Description |
| --- | --- |
| `data` | Value returned by the response interpreter. |
| `raw` | Native `Response` object. |
| `ok` | Native HTTP success flag. |
| `status` | HTTP status code. |
| `statusText` | HTTP status text. |
| `headers` | Copy of the response headers. |
| `body` | Native response body stream, or `null`. |
| `redirected` | Whether Fetch followed a redirect. |
| `type` | Native response type. |
| `bodyUsed` | Whether the native response body has been consumed. |
| `url` | Final response URL, or the requested URL when unavailable. |
| `config` | Internal request configuration used by the adapter. |

Body helpers read from independent response clones:

```ts
const result = await api.get<User>("/users/123");

const text = await result.text();
const payload = await result.json<AuditPayload>();
const file = await result.blob();
const bytes = await result.arrayBuffer();
const form = await result.formData();
const nativeClone = result.clone();
```

The default interpreter returns `undefined` for empty bodies and status
`204`, `205`, or `304`. JSON media types are parsed as JSON, including
`application/*+json`; other media types are returned as text.

## Errors

### `ApexaError`

`ApexaError` is the default error type. It exposes:

```ts
try {
  await api.get("/users/missing");
} catch (error) {
  if (error instanceof ApexaError) {
    console.log(error.code);
    console.log(error.priority);
    console.log(error.config);
    console.log(error.response?.status);
    console.log(error.cause);
  }
}
```

Common error codes include:

| Code | Meaning |
| --- | --- |
| `ERR_CONFIG` | Invalid client or request configuration. |
| `ERR_INTERCEPTOR` | An interceptor returned an invalid value. |
| `ERR_NETWORK` | The adapter failed before receiving a response. |
| `ERR_TIMEOUT` | The request exceeded its timeout. |
| `ERR_ABORTED` | The request was cancelled by its signal. |
| `ERR_PARSE` | The response interpreter could not parse the response. |
| `ERR_CSRF` | A required CSRF token was unavailable. |
| `ERR_HTTP` | The server returned an unsuccessful HTTP status. |

### Error policy

Use `error.handler` to map an unsuccessful response body to application error
details:

```ts
const api = new Apexa({
  error: {
    handler: (data) => ({
      message: typeof data.message === "string"
        ? data.message
        : "Request failed",
      code: typeof data.code === "string" ? data.code : "API_ERROR",
      priority: "medium",
    }),
  },
});
```

The handler receives the parsed response object when it is a record. Its
returned `message`, `code`, and `priority` values are normalized defensively.

To use an application error class, provide a constructor accepting
`(message, options)`:

```ts
class ApplicationError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    options: { code: string },
  ) {
    super(message);
    this.name = "ApplicationError";
    this.code = options.code;
  }
}

const api = new Apexa({
  error: { customError: ApplicationError },
});
```

## Interceptors

Interceptors let you run code at two points in the request pipeline:

1. **Request interceptors** run before the adapter sends the request. They can
   add headers, update metadata, or replace request configuration.
2. **Response interceptors** run after the response has been parsed. They can
   transform response data or handle errors consistently.

Both registries expose `use`, `eject`, and `clear`. `use` returns a numeric ID
that can later be passed to `eject`.

### Authentication and request IDs

This example adds a bearer token and a unique request ID to every request:

```ts
const requestInterceptorId = api.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.set("Authorization", "Bearer " + token);
  }

  config.headers.set("X-Request-ID", crypto.randomUUID());
  return config;
});

// Remove this interceptor when it is no longer needed.
api.interceptors.request.eject(requestInterceptorId);
```

### Response transformation and error handling

The fulfilled handler receives an `ApexaResponse`. The rejected handler
receives the error produced by the request pipeline. Always return the
response/configuration from a fulfilled handler unless you intentionally
replace it.

```ts
import { ApexaError } from "apexa";

api.interceptors.response.use(
  (response) => {
    console.info(
      `${response.config.method} ${response.url} - ${response.status}`,
    );

    // Transform data while preserving the response metadata.
    if (response.data && typeof response.data === "object") {
      return {
        ...response,
        data: {
          ...response.data,
          receivedAt: new Date().toISOString(),
        },
      };
    }

    return response;
  },
  (error) => {
    if (error instanceof ApexaError && error.code === "ERR_ABORTED") {
      console.warn("Request was cancelled.");
    }

    // Re-throw to preserve the normal Promise rejection behavior.
    throw error;
  },
);
```

### Async interceptors

Handlers may be asynchronous. This is useful when a token must be refreshed
before a request:

```ts
api.interceptors.request.use(async (config) => {
  const token = await refreshTokenIfRequired();
  config.headers.set("Authorization", "Bearer " + token);
  return config;
});
```

### Removing interceptors

Remove one interceptor by ID, or remove all interceptors from a registry:

```ts
api.interceptors.request.eject(requestInterceptorId);
api.interceptors.request.clear();
api.interceptors.response.clear();
```

Request fulfilled handlers receive and return `InternalRequestConfig`.
Response fulfilled handlers receive and return `ApexaResponse`. Rejected
handlers receive an unknown error and may recover or throw a replacement
error. If a fulfilled handler returns an invalid value, Apexa rejects the
request with `ERR_INTERCEPTOR`.

## Retries

Retries are disabled by default. When enabled, only `GET`, `HEAD`, and
`OPTIONS` requests are retried automatically. `POST`, `PUT`, `PATCH`, and
`DELETE` are never retried automatically.

```ts
const api = new Apexa({
  retry: {
    enabled: true,
    retries: 3,
    delay: 250,
    maxDelay: 5_000,
    backoff: 2,
    retryNetworkErrors: true,
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
});
```

Defaults:

| Option | Default |
| --- | --- |
| `enabled` | `false` |
| `retries` | `2` |
| `delay` | `300` ms |
| `maxDelay` | `5000` ms |
| `backoff` | `2` |
| `statusCodes` | `408`, `425`, `429`, `500`, `502`, `503`, `504` |
| `retryNetworkErrors` | `true` |

The server's numeric `Retry-After` header is honored, subject to
`maxDelay`. Cancellation stops both the active request and any retry delay.

## CSRF protection

CSRF protection is disabled by default. When enabled, Apexa resolves a token
from `tokenProvider`, or from the browser cookie named `csrf-token`, and sends
it in the `X-CSRF-Token` header:

```ts
const api = new Apexa({
  csrf: {
    enabled: true,
    tokenProvider: async () => getTokenFromStore(),
    headerName: "X-XSRF-TOKEN",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    required: true,
  },
});
```

By default, a missing token is an error. Set `required: false` to continue
without a token. Cookie lookup is skipped in non-browser runtimes.

## Adapters and interpreters

### Custom adapter

An adapter receives `InternalRequestConfig` and must return a native
`Response`:

```ts
import type { HttpAdapter } from "apexa";

const adapter: HttpAdapter = async (config) => {
  return fetch(config.url, {
    method: config.method,
    headers: config.headers,
    signal: config.signal,
  });
};

const api = new Apexa({ adapter });
```

`fetchAdapter` is the built-in adapter used by default.

### Custom response interpreter

An interpreter receives the native `Response` and request configuration:

```ts
const api = new Apexa({
  interpreter: async (response) => ({
    raw: await response.text(),
  }),
});
```

The returned value becomes `ApexaResponse.data`.

## Type reference

### HTTP types

- `HttpMethod`: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`,
  `CONNECT`, or `TRACE`
- `QueryScalar`: `string | number | boolean | bigint | Date`
- `QueryValue`: scalar, readonly scalar array, `null`, or `undefined`
- `QueryParams`: readonly string-keyed query map
- `RequestBody`: Fetch body, JSON object, readonly array, or `null`
- `RequestMetadata`: readonly string-keyed application metadata
- `FetchOptions`: supported Fetch request options
- `CredentialsMode`: alias for `RequestCredentials`

### Policy types

- `RetryStatus`
- `RetryOptions`
- `CsrfOptions`
- `ErrorPolicy`

### Pipeline types

- `ApexaOptions`
- `ApexaRequestOptions`
- `InternalRequestConfig`
- `HttpAdapter`
- `ResponseInterpreter`
- `ApexaResponse<T>`
- `ApexaRequestMethods`
- `RequestFulfilledInterceptor`
- `RequestRejectedInterceptor`
- `ResponseFulfilledInterceptor`
- `ResponseRejectedInterceptor`
- `InterceptorId`

## Compatibility and support

Apexa relies on standard Fetch and Web API primitives such as `fetch`,
`Headers`, `Response`, `AbortController`, `Blob`, and `FormData`. Provide
compatible implementations when running in a non-browser environment that
does not expose these APIs globally.
