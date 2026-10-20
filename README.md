# Apexa

**A production-ready, TypeScript-first HTTP client built on the Fetch API.**

Apexa provides a strongly typed client for browser and Node.js applications,
with configurable request pipelines, retries, CSRF protection, interceptors,
custom adapters, and flexible response parsing.

[![npm version](https://img.shields.io/npm/v/apexa)](https://www.npmjs.com/package/apexa)
[![License](https://img.shields.io/github/license/mdtolhabinashraf/apexa)](./LICENSE)

## Installation

```bash
npm install apexa
```

```bash
pnpm add apexa
```

```bash
yarn add apexa
```

## Quick start

```ts
import Apexa from "apexa";

const api = new Apexa({
  baseUrl: "https://api.example.com",
  basePath: "/api/v1",
  timeout: 15_000,
});

const response = await api.get<User>("/users/123");

console.log(response.data);
console.log(response.status);
console.log(response.headers.get("content-type"));
```

## Request methods

```ts
await api.request<T>("/users", { method: "GET" });
await api.get<T>("/users");
await api.post<T>("/users", { name: "Ada" });
await api.put<T>("/users/123", { name: "Ada" });
await api.patch<T>("/users/123", { name: "Ada" });
await api.delete<T>("/users/123");
await api.head("/users/123");
await api.options<T>("/users");
```

All methods return `Promise<ApiResponse<T>>`. HTTP failures throw `ApexaError`
with a machine-readable `code` and the parsed response available as
`error.response`.

### Error handling

Use `errorHandler` to map an unsuccessful response into an application-specific
error message, code, and priority:

```ts
const api = new Apexa({
  errorHandler: (data) => ({
    message:
      typeof data.message === "string"
        ? data.message
        : "The request could not be completed.",
    code: typeof data.code === "string" ? data.code : "API_ERROR",
    priority: "medium",
  }),
});
```

The handler is called for non-2xx responses after the body is interpreted.
Returned fields are normalized when missing or invalid, and custom string
codes are supported. See the [API Reference](./docs/API.md#errors) for the
standard client error codes and complete error behavior.

## Response access

`ApiResponse<T>` includes the parsed `data`, status metadata, headers, request
configuration, and the native Fetch response:

```ts
const response = await api.get<User>("/users/123");

const user = response.data;
const rawResponse = response.raw;
const text = await response.text();
const json = await response.json<AuditPayload>();
const file = await response.blob();
const bytes = await response.arrayBuffer();
const form = await response.formData();
```

The manual body helpers read from independent response clones, so they can be
used without consuming the parsed response payload.

## Features

- Strong TypeScript types for requests, responses, errors, and configuration
- Base URLs, base paths, query parameters, headers, and request metadata
- Request and response interceptors
- Configurable timeouts and minimum request duration
- Safe retries for transient responses and network errors
- CSRF token handling
- Custom HTTP error handling with application-defined error codes
- Custom Fetch-compatible adapters and response interpreters
- Native Fetch response access for streaming and specialized body handling

## Documentation

See the complete [API Reference](./docs/API.md) for all exported classes,
functions, types, options, defaults, and examples.

## Security

For security considerations, supported versions, and vulnerability reporting,
see the [Security Policy](./SECURITY.md).

Please report security vulnerabilities through the private reporting process
described in `SECURITY.md` rather than disclosing sensitive details publicly.

## Contributing

Contributions, bug reports, and feature requests are welcome. Before
contributing, review the [Contributing Guide](./CONTRIBUTING.md).

## License

This project is licensed under the [MIT License](./LICENSE).
