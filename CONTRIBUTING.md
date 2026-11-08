# Contributing to hiiire

**English** | [Русский](./CONTRIBUTING.ru.md)

Thank you for helping the project. This guide covers everything you need to run hiiire locally and submit changes.

## Before you start

- For significant changes (a new feature, a database schema change, a change to the public API or to billing behaviour), open an issue first and describe the idea. That way we agree on the approach before you spend time on code.
- Small fixes (typos, bugs with clear reproduction steps, tests) can go straight to a pull request.
- Do not report vulnerabilities in public issues; see [SECURITY.md](./SECURITY.md).
- Issues and pull requests can be written in English or Russian.

## Running locally

Requirements: Node.js `>= 20.9` (tested on `22.17`), npm `>= 10`, and a separate Supabase project for development (cloud or self-hosted).

```bash
npm ci
cp .env.example .env.local   # fill in the values for your development environment
npm run dev                  # http://localhost:3000
```

- The database schema for an empty project is built from `supabase/migrations/`; see [`supabase/bootstrap/README.md`](./supabase/bootstrap/README.md) for the order and details.
- AI jobs are processed by a separate process: `npm run worker:build && npm run worker:start`.
- Integrations (HH.ru, AI providers, Telegram, Robokassa, Tika, PostHog) are optional to get started: without their keys the related features are simply unavailable. All variables are listed in [`.env.example`](./.env.example). Details are in the [technical reference](./docs/technical-reference.md) (in Russian) and [DEPLOYMENT.md](./DEPLOYMENT.md).
- Never connect a local build to someone else's production database, and never commit `.env*` files with real values.

## Branches and pull requests

- The development branch is `dev`. Branch off the latest `dev` and open your pull request against `dev`; `main` is updated by release pull requests from `dev`.
- Branch names: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- One pull request, one logical change. In the description, explain what changed, why, and how you tested it.

## Checks before a pull request

```bash
npm run lint
node --no-warnings --experimental-strip-types --test tests/*.test.mts   # or a specific npm run test:*
npm run build
```

If you changed the worker, the Telegram relay or the Tika proxy, also run their builds and tests (`npm run worker:selfcheck:build`, `npm run telegram-relay:test`, `npm --prefix tika-proxy test`).

## Code guidelines

hiiire runs in production, so changes are reviewed as production code, not as a prototype.

- **Edge cases.** Think through empty and partially filled states, network and API errors, repeated clicks, request races, access restrictions, long input and narrow screens.
- **Interface text** is written for end users: short, in Russian (the product UI is in Russian), with a clear next step. No raw error codes, stack traces or technical wording.
- **APIs and forms:**
  - validation errors return `400` in the `{ error, message?, issues? }` format, where `message` is safe to show to the user;
  - Zod schemas for user-facing fields have explicit Russian messages;
  - the client mirrors server limits (`maxLength`, inline validation);
  - API errors are parsed with the project's shared helper, not with a local `throw new Error(json.error)`.
- **Layout:** long user text is protected with `min-w-0` / `truncate` / `break-words`; UI defects that repeat across screens are fixed in the `components/ui/*` primitives.
- **Database:** schema changes go only into a new migration in `supabase/migrations/` (never edit migrations that were already applied), together with updates to [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md) and the types in `lib/supabase/database.types.ts`.
- **Documentation:** if behaviour, the API, configuration or environment variables change, update the [technical reference](./docs/technical-reference.md), the deployment guide and `.env.example`. If the change affects the project overview (features, quick start, minimum variables), update the README. README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT and DEPLOYMENT each have an English (`*.md`) and a Russian (`*.ru.md`) version; update both, and say so in the pull request if you are unsure about a translation. Manual QA scenarios go into [`docs/For_juniors/hiiire_for_junior.md`](./docs/For_juniors/hiiire_for_junior.md) (in Russian), described in terms of the visible UI, URLs and HTTP statuses, without references to internal functions.

## License of contributions

The project is licensed under the [GNU AGPL-3.0](./LICENSE). By submitting a pull request, you agree that your contribution is distributed under the same license.

## Community conduct

By taking part in the project, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
