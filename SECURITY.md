# Security Policy

## Supported versions

Security fixes are intended for the latest supported release. Until the first stable release is published, support commitments are not yet established.

## Reporting a vulnerability

Please do not publish exploit details in a public issue.

Contact the repository maintainers privately using the security contact configured in the repository or hosting platform. Include:

- Affected version or commit.
- Impact and attack prerequisites.
- Steps to reproduce in a controlled environment.
- A suggested mitigation, if known.

Do not include real credentials, private user data, or production secrets.

## Security notes

- Never place secrets in browser-side bundles.
- Do not treat TypeScript generic types as runtime validation.
- CSRF handling in the client does not replace server-side CSRF defenses.
- Retry logic can duplicate mutations; use idempotency keys where appropriate.
- Configure CORS, authorization, TLS, cookie attributes, and server-side input validation independently.
