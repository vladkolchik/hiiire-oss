# hiiire

![hiiire](./.project_documentation_and_meta/hiiire_main_logo_with_background.png)

**English** | [Русский](./README.ru.md)

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

hiiire is an open-source recruiting CRM (ATS) with AI resume scoring, an HR assistant and HH.ru integration. It is built with Next.js and Supabase.

The product targets the Russian market: the user interface is in Russian, and the integrations are HH.ru for job postings and applications and Robokassa for payments. The [detailed technical reference](./docs/technical-reference.md) and the deployment guide are in Russian too.

---

## Features

- **HH.ru integration**: employer OAuth, import of vacancies and applications, optional background sync.
- **AI resume analysis**: a match score against the vacancy, with strengths, weaknesses and recommendations. Runs asynchronously in a worker and supports OpenAI, Gemini and DeepSeek with automatic fallback.
- **HR assistant**: chats inside the CRM that search the team's vacancies, candidates and interviews and propose changes, which run only after the user confirms them. It follows the same access rules as the rest of the CRM.
- **Resume upload**: PDF, DOC, DOCX and TXT. Text is extracted by a protected Apache Tika service, and the candidate card is prefilled from it.
- **Interview calendar**: schedule, reschedule, cancel and complete interviews.
- **Analytics**: hiring funnel, hiring goals, risks and AI breakdowns, with export.
- **Teams**: several users per company with `admin`, `hr` and `recruiter` roles, and a shared balance of AI credits.
- **Billing**: Starter and Professional subscriptions and one-off credit top-ups through Robokassa. Enterprise uses manual invoices.
- **Notifications**: a Telegram bot (webhook only) and email through Resend.
- **Platform admin panel** (`/admin`): companies, users, credits, marketing attribution and AI queue metrics.
- **Content**: a blog and knowledge base stored as Markdown in the repository, with SEO checks.
- Light, dark and system themes.

## Architecture

The repository contains several independently deployed services:

| Service | Path | Role |
| --- | --- | --- |
| `hiiire-web` | repository root | Next.js 16 App Router: UI and API routes (`app/api/*`) |
| `hiiire-worker` | `worker/` | Node.js worker that processes the `jobs_ai` queue (AI analysis) and runs the optional HH.ru sync |
| `hiiire-tika` | `tika-proxy/`, `docker-compose.yml` | Authenticated Fastify proxy in front of Apache Tika for resume text extraction |
| `hiiire-telegram-relay` | `telegram-relay/` | Optional standalone relay for the Telegram webhook and outgoing Bot API calls |

The web app and the worker talk only through Supabase (Postgres): the web app puts AI jobs in the queue, and the worker claims them, calls the AI provider and writes the results. The browser never calls Supabase directly. All data access goes through same-origin `/api/*` routes, which enforce company and role checks on the server on top of Row Level Security.

## Tech stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, React Hook Form, Zod
- **Backend**: Supabase (Postgres, Auth, Storage), Node.js worker
- **AI**: OpenAI, Gemini, DeepSeek
- **Integrations**: HH.ru API, Robokassa, Telegram Bot API, Resend, PostHog, Apache Tika

## Getting started

### Prerequisites

- Node.js `>= 20.9` (tested on `22.17`) and npm `>= 10`
- A Supabase project for development (cloud or self-hosted). Never point a local build at a production database.

### 1. Install dependencies

```bash
npm ci
```

### 2. Create the database schema

Apply the SQL files from [`supabase/migrations/`](./supabase/migrations) to an empty Supabase project in filename order, for example with `psql` or the Supabase SQL editor. [`supabase/bootstrap/README.md`](./supabase/bootstrap/README.md) explains what the bootstrap covers and how it is generated.

### 3. Configure the environment

```bash
cp .env.example .env.local
```

The minimum set to run the app:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL and public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for API routes and the worker |

Optional integrations are disabled until their variables are set:

| Feature | Variables |
| --- | --- |
| AI resume analysis (worker) | `AI_PROVIDER`, `OPENAI_API_KEY` / `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` |
| HR assistant and candidate card prefill | `DEEPSEEK_API_KEY` |
| HH.ru | `HH_ru_client_id`, `HH_ru_client_secret`, `HH_RU_REDIRECT_URI` |
| Resume file upload | `TIKA_BASE_URL`, `TIKA_AUTH_TOKEN` |
| Telegram notifications | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` |
| Email notifications | `RESEND_API_KEY`, `EMAIL_FROM` |
| Payments | `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD1`, `ROBOKASSA_PASSWORD2`, `CRON_SECRET` |
| Product analytics | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |
| Operator details on legal pages | `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_INN`, `LEGAL_OPERATOR_OGRN`, `LEGAL_OPERATOR_REGISTRATION_DATE` |

The full list with comments is in [`.env.example`](./.env.example).

The legal pages (`/terms`, `/privacy`, `/refund`, `/contact`, `/about`) render without the operator's details when `LEGAL_OPERATOR_*` is not set. That is fine locally, but production must set them.

### 4. Run

```bash
npm run dev            # web app on http://localhost:3000
```

AI analysis runs in a separate process:

```bash
npm run worker:build
npm run worker:start
```

Create an account through `/signup`. To add candidates, create at least one vacancy first.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` / `npm run start` | Production build and start |
| `npm run lint` | ESLint |
| `node --no-warnings --experimental-strip-types --test tests/*.test.mts` | All tests (Node test runner) |
| `npm run test:*` | Test groups, for example `test:content`, `test:telegram`, `test:resume-extraction` |
| `npm run worker:build` / `npm run worker:start` | Build and start the worker |
| `npm run telegram-relay:test` | Telegram relay tests |
| `npm run content:check` / `npm run content:lint` | Blog and knowledge base checks |

## Deployment

In production each service runs as a separate app built from this repository. The web app can also be built as a Docker image from `Dockerfile.web`. Setup, environment variables, cron jobs and health checks are covered in [DEPLOYMENT.md](./DEPLOYMENT.md) (in Russian).

## Documentation

- [Technical reference](./docs/technical-reference.md) (in Russian): behaviour of every page, API endpoints, billing, the AI pipeline, HH.ru sync, notifications and SQL migrations.
- [Database schema](./docs/DATABASE_SCHEMA.md)
- [Content workflow](./docs/content-workflow.md)
- [Manual QA guide](./docs/For_juniors/hiiire_for_junior.md) (in Russian)

## Contributing

Contributions are welcome. [CONTRIBUTING.md](./CONTRIBUTING.md) covers local setup, the branch flow, checks before a pull request and code conventions. Report bugs and ideas through the issue templates.

Please report security vulnerabilities privately, as described in [SECURITY.md](./SECURITY.md). By taking part in the project you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

Copyright © 2025–2026 hiiire authors.

hiiire is licensed under the [GNU Affero General Public License v3.0](./LICENSE) (`AGPL-3.0-only`). You may use, modify and distribute the code, including running it as a network service, as long as you make the source code of your modified version available to the users of that service under the same license.

The license does not cover the hiiire name or logo: forks and independent deployments must use their own name and branding.

## Acknowledgements

[Next.js](https://nextjs.org/), [Supabase](https://supabase.com/), [shadcn/ui](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/), [Apache Tika](https://tika.apache.org/).
