# Changelog

All notable changes to Apexa are documented here.

This project follows [Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-10-20

The current stable release of Apexa.

### Added

- Class-based, strongly typed HTTP client built on the Fetch API.
- Request methods for `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.
- Configurable base URLs, base paths, query parameters, headers, and metadata.
- Typed `ApexaResponse<T>` contracts with status, headers, URL, request configuration,
  native response access, and manual body readers.
- Request and response interceptors with registration and removal support.
- Per-request overrides for client configuration.
- Configurable Fetch-compatible adapters and response interpreters.
- Timeout, cancellation, minimum-duration, retry, and CSRF handling.
- Standardized `ApexaError` errors with stable machine-readable error codes.
- ESM package exports and generated TypeScript declaration files.

### Documentation

- Added complete API reference documentation.
- Added installation, quick-start, response access, security, support, and
  contribution guidance.
