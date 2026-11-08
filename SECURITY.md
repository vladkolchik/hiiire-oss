# Security Policy

**English** | [Русский](./SECURITY.ru.md)

## Reporting a vulnerability

Please **do not disclose** vulnerabilities in public issues, discussions or pull requests.

Report the problem privately in one of these ways:

1. **GitHub Private Vulnerability Reporting**: the **Security → Report a vulnerability** tab of this repository (preferred).
2. Email **inbox@hiiire.com** with the subject `Security report`.

Please include:

- a description of the vulnerability and its possible impact;
- the affected URLs, API endpoints or files;
- steps to reproduce or a proof of concept;
- the version or commit you tested.

## What happens next

- We acknowledge your report within 3 business days.
- We assess the issue and share a remediation plan within 10 business days.
- Once a fix is released, we agree on public disclosure with you and, if you wish, credit you in the acknowledgements.

## Scope

In scope: the code in this repository, including the web app, API routes, the worker, the Telegram relay, the Tika proxy, SQL migrations and RLS policies.

Out of scope:

- attacks on other people's self-hosted installations and on third-party services (Supabase, HH.ru, AI providers, Robokassa);
- social engineering, physical access, DoS and load attacks;
- automated scanner reports without a confirmed exploitation scenario.

During research, use only your own accounts and your own installation. Do not access other users' data and do not disrupt the hiiire.com service.

## Supported versions

Security fixes are released for the current state of the `main` branch.
