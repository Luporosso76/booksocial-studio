# Security Policy

## Reporting a Vulnerability

Please **do not open public issues** for vulnerabilities, token leaks, credential
exposure, or anything that could compromise user data.

Report privately via GitHub: open the repository's **Security → Report a
vulnerability** ("Private vulnerability reporting"). This keeps the report
confidential until a fix is available.

Please include:

- affected version or commit;
- steps to reproduce;
- impact;
- whether any secret, token, or credential may be involved.

**Do not** include real API keys, Facebook/Instagram tokens, `.env` files, or the
contents of the encrypted secrets store in your report.

## Supported Versions

Only the latest version on the `main` branch is currently supported.

## Secrets

BookSocial Studio stores local secrets **encrypted** in the configured data
directory. Users are responsible for protecting their `.env`, data directory,
backups, and deployment environment. When running outside `localhost` (e.g. on a
VPS), always enable authentication and place the app behind an HTTPS reverse
proxy.
