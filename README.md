# Apexa

**A configurable, TypeScript-first HTTP client built on the Fetch API.**

Apexa provides a small class-based API for HTTP requests, request and response interceptors, per-request configuration overrides, custom adapters, response parsing, cancellation, timeouts, CSRF handling, and opt-in retries.

> **Release status:** Review and test the implementation before publishing. The documentation and release scaffold do not certify the current source code as production-ready.

## Features

- TypeScript-first API with generic response types.
- Instance defaults with per-request overrides, including `baseUrl` and `basePath`.
- Familiar `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and `request` methods.
- Query parameter serialization.
- JSON request-body serialization and content-type-aware response parsing.
- Request and response interceptors.
- Custom Fetch-compatible adapters and response interpreters.
- Request cancellation with `AbortSignal`.
- Request timeouts and minimum request duration.
- Optional CSRF token handling.
- Opt-in retry configuration for safe methods.
- Structured errors with stable error codes.

## Requirements

- A supported Node.js release or a modern browser with the Fetch API.
- TypeScript 5.x or later if consuming TypeScript declarations directly.

The default Fetch adapter requires absolute URLs in environments where Fetch does not resolve relative URLs (for example, Node.js). Configure `baseUrl` or provide a custom adapter.

## Installation

```bash
npm install apexa
```

If the unscoped `apexa` name is unavailable, install the published scoped name chosen by the maintainers instead.

## Quick start

```ts
import Apexa from "apexa";

interface User {
  id: string;
  name: string;
  email: string;
}

const api = new Apexa({
  baseUrl: "https://api.example.com",
  basePath: "/api/v1",
  timeout: 10_000,
  headers: {
    Accept: "application/json",
  },
});

const response = await api.get<User>("/users/123");

console.log(response.status);
console.log(response.data.name);
```

The generic type passed to `get<T>()` is a compile-time expectation. It does **not** validate untrusted server data at runtime. Validate API payloads with a runtime schema when that guarantee is required.

## Override settings for one request

Request-level options override the instance defaults.

```ts
const response = await api.get<User>("/users/123", {
  baseUrl: "https://staging.example.com",
  basePath: "/api/v2",
  timeout: 5_000,
  credentials: "same-origin",
  headers: {
    Authorization: "Bearer YOUR_TOKEN",
  },
  query: {
    include: ["profile", "roles"],
    active: true,
  },
});
```

An absolute URL passed as the `url` argument bypasses `baseUrl` and `basePath`.

## Send JSON

```ts
interface CreateUserInput {
  name: string;
  email: string;
}

const response = await api.post<User>("/users", {
  name: "Ada Lovelace",
  email: "ada@example.com",
});
```

Plain objects and arrays are serialized as JSON by the default adapter. Use `FormData`, `Blob`, `URLSearchParams`, or another supported `BodyInit` value for non-JSON payloads. Do not manually set a multipart `Content-Type` header for `FormData`; the runtime must generate the boundary.

## Interceptors

```ts
const requestInterceptorId = api.interceptors.request.use((config) => {
  config.headers.set("X-Client", "Apexa");
  return config;
});

const responseInterceptorId = api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    console.error("Request failed", error);
    throw error;
  },
);

// Remove interceptors when no longer needed.
api.interceptors.request.eject(requestInterceptorId);
api.interceptors.response.eject(responseInterceptorId);
```

Request interceptors execute in reverse registration order. Response interceptors execute in registration order. An interceptor should return the updated configuration or response unless it intentionally rejects the chain.

## Error handling

```ts
import Apexa, { ApexaError } from "apexa";

const api = new Apexa({ baseUrl: "https://api.example.com" });

try {
  await api.get("/private");
} catch (error: unknown) {
  if (error instanceof ApexaError) {
    console.error(error.code);
    console.error(error.message);
    console.error(error.response?.status);
  } else {
    throw error;
  }
}
```

Errors may expose a stable `code`, request `config`, response metadata, and the original `cause` where available. See [API reference](./docs/API.md) for the error code list.

## Cancellation

```ts
const controller = new AbortController();

const request = api.get<User>("/users/123", {
  signal: controller.signal,
});

// Cancel whenever appropriate.
controller.abort();

await request;
```

The request rejects when aborted. Handle the rejection at the call site.

## Timeout and minimum duration

```ts
const response = await api.get<User>("/users/123", {
  timeout: 8_000,
  minimumTime: 250,
});
```

`timeout: 0` disables the timeout. `minimumTime` requests that the total request operation take at least the specified number of milliseconds; it is not a server-side processing guarantee.

## CSRF

CSRF handling is disabled by default. Enable it only when it matches the security model of your application.

```ts
const api = new Apexa({
  baseUrl: "https://app.example.com",
  csrf: {
    enabled: true,
    cookieName: "csrf-token",
    headerName: "X-CSRF-Token",
    required: true,
  },
});
```

By default, the implementation looks for a readable cookie. `HttpOnly` cookies cannot be read by JavaScript; use `tokenProvider` or another server/application-specific mechanism when needed. CSRF tokens do not replace authorization, secure cookie settings, or server-side CSRF validation.

## Retries

Retries are disabled by default. Enable them deliberately:

```ts
const response = await api.get("/status", {
  retry: {
    enabled: true,
    retries: 2,
    delay: 300,
    maxDelay: 5_000,
    backoff: 2,
  },
});
```

The default adapter should retry only operations safe to repeat. Do not automatically retry non-idempotent mutations unless your API supports idempotency keys and you have deliberately designed for duplicate delivery.

## Custom response interpreter

```ts
const api = new Apexa({
  baseUrl: "https://api.example.com",
  interpreter: async (response) => {
    if (response.status === 204) return undefined;
    return response.json() as Promise<unknown>;
  },
});
```

The interpreter parses response data; it does not validate the returned payload's shape.

## Custom adapter

```ts
import type { HttpAdapter } from "apexa";

const adapter: HttpAdapter = async (config) => {
  return fetch(config.url, {
    method: config.method,
    headers: config.headers,
    signal: config.signal,
    credentials: config.credentials,
  });
};

const api = new Apexa({
  baseUrl: "https://api.example.com",
  adapter,
});
```

A custom adapter must honor the contract expected by Apexa and return a native `Response`. If it needs to support additional HTTP methods or runtime-specific behavior, document and test those guarantees.

## API reference

See [docs/API.md](./docs/API.md) for the public configuration, methods, interceptors, errors, and defaults.

## Browser and server environments

- The default adapter uses the platform Fetch API.
- Cookie-based CSRF token lookup requires a browser environment with `document.cookie`.
- Browser CORS rules and server-side networking restrictions still apply.
- In Node.js, set an absolute `baseUrl` for relative endpoint paths.
- Do not put secrets in client-side bundles or request metadata.

## Development

```bash
npm install
npm run typecheck
npm run build
npm pack --dry-run
```

Before publishing, verify the package contents and test installation from the generated tarball.

## License

MIT. See [LICENSE](./LICENSE).
