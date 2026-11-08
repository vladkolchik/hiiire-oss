# 🚀 Deploying hiiire on Timeweb Cloud App

**English** | [Русский](./DEPLOYMENT.ru.md)

The project is deployed as separate apps from a single repository:

- **`hiiire-web`**: the Next.js app (UI + `app/api/*`)
- **`hiiire-worker`**: the background worker for the AI job queue (`jobs_ai`)
- **`hiiire-tika`**: a separate Docker Compose app that extracts text from resume files (Node/Fastify proxy + `apache/tika`)
- **`hiiire-telegram-relay`**: a standalone Telegram webhook/send relay for `tg.hiiire.com`, deployed outside Russia.

This keeps resume analysis reliable: the user can close the tab or lose their connection and the result still appears, because the analysis runs in the worker.

`hiiire-web` can be deployed either with the regular (non-compose) Timeweb App settings or from the separate `Dockerfile.web`. `hiiire-worker` still uses the regular (non-compose) Timeweb App settings. `hiiire-tika` is deployed separately with Docker Compose. `hiiire-telegram-relay` is deployed as a separate Dockerfile-based Timeweb App.

---

## 1) Timeweb Cloud App: `hiiire-web` (Next.js)

### Build / Start
- **Build command**: `npm run build`
- **Start command**: `npm run start`

### Docker image (optional)

For Docker hosting, a VPS or Coolify you can build a separate production image of the web app:

```bash
docker build \
  -f Dockerfile.web \
  -t hiiire-web \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
  --build-arg NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_key \
  --build-arg NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com \
  .
```

Run it:

```bash
docker run --rm \
  --env-file .env.production \
  -p 3000:3000 \
  hiiire-web
```

`Dockerfile.web` uses the Next.js standalone output and runs the generated `server.js` on `0.0.0.0:3000`. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required at `docker build` time; the other `NEXT_PUBLIC_*` build args are optional. The browser part of Next.js embeds public env into the bundle. Pass the same values to the runtime env too, because server and API routes also read the Supabase and PostHog env at runtime.

The container healthcheck calls `GET /api/health`.

The root `docker-compose.yml` is not used for `hiiire-web`: it remains a separate compose deployment for `hiiire-tika`.

### Environment variables
Minimum:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

For Supabase + async AI (required, because `app/api/*` creates jobs and vacancies on the server):

```env
SUPABASE_SERVICE_ROLE_KEY=... # server-only
AUTH_VERIFICATION_CONTEXT_SECRET=... # server-only, strongly recommended for verify-email context cookie signing
APP_ORIGIN=https://your-production-domain.com # optional, but recommended when app runs behind reverse proxy
```

> Set `AUTH_VERIFICATION_CONTEXT_SECRET` to its own long random secret.
> If it is not set, the app falls back to `SUPABASE_SERVICE_ROLE_KEY`.

### PostHog analytics (optional)

For product analytics and server error tracking:

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

If `NEXT_PUBLIC_POSTHOG_KEY` is not set, the app works without PostHog. Next.js server-side errors are sent through `instrumentation.ts`; request headers are not sent to PostHog.

### Resume extraction through Tika

To upload resume files, the web app needs access to the protected Tika proxy:

```env
TIKA_BASE_URL=https://your-tika-proxy.example.com
TIKA_AUTH_TOKEN=...            # server-only, must match the proxy token
TIKA_TIMEOUT_MS=20000          # optional; keep greater than proxy TIKA_UPSTREAM_TIMEOUT_MS
```

The web app sends the file to the Tika proxy, receives plain text and stores it in `candidates.resume_text`. If the user keeps the original file, it is still stored in Supabase Storage; Tika does not replace storage and has no access to the database.

Upload limits are the same for every format: files up to 5 MB, extracted text up to 50,000 characters / 8,000 words, at least 20 characters, plus the web request timeout and the proxy upstream timeout. The web timeout must be greater than the proxy upstream timeout, so that the proxy can return a classified `504`/`503` before the web app aborts the request. The old PDF-only page limit no longer applies.

To store `.doc` files, the `resumes` bucket must include `application/msword` in `allowed_mime_types`. This is checked and updated through Supabase MCP after verifying that the MCP `project_ref` matches `NEXT_PUBLIC_SUPABASE_URL`; bucket settings are not changed with ad hoc SQL or manual workarounds.

### Telegram bot (webhook-only)

If you use the Telegram bot for notifications and broadcasts:

```env
TELEGRAM_BOT_TOKEN=...         # server-only
TELEGRAM_BOT_USERNAME=...      # without @
TELEGRAM_WEBHOOK_SECRET=...    # server-only
TELEGRAM_OWNER_CHAT_IDS=123,456
# Choose relay mode:
TELEGRAM_RELAY_URL=https://tg.hiiire.com
TELEGRAM_RELAY_SECRET=...      # server-only
# Or proxy mode; do not set it together with relay variables:
# TELEGRAM_PROXY_URL=http://user:password@proxy.example.com:8080 # server-only
TELEGRAM_REQUEST_TIMEOUT_MS=8000
CRON_SECRET=...                # server-only (for /api/cron/*)
```

`hiiire-web` rejects a configuration containing both `TELEGRAM_RELAY_URL` and `TELEGRAM_PROXY_URL`. Without either variable, it calls Telegram directly.

#### Telegram through an HTTP(S) proxy

Proxy mode applies only to outbound Bot API calls such as `sendMessage`, `setWebhook`, and `getWebhookInfo`. It does not make the incoming webhook reachable: Telegram must be able to send HTTPS requests to `https://hiiire.com/api/telegram/webhook`.

Configure `hiiire-web`:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_OWNER_CHAT_IDS=123,456
TELEGRAM_PROXY_URL=http://user:password@proxy.example.com:8080
TELEGRAM_REQUEST_TIMEOUT_MS=8000
```

The proxy URL supports `http://` and `https://`, including percent-encoded Basic Auth credentials. Paths, query strings, fragments, and SOCKS schemes are rejected. Keep this value server-only.

Register the webhook and verify it through the proxy:

```bash
npm run telegram:webhook -- set --url https://hiiire.com/api/telegram/webhook
npm run telegram:webhook -- get
```

The CLI reads `TELEGRAM_PROXY_URL`; use `--proxy-url <url>` only for a one-off override. Then verify `/start <token>` from a test account and send a test notification. To roll back to direct mode, remove `TELEGRAM_PROXY_URL` and redeploy. To switch to relay mode, remove `TELEGRAM_PROXY_URL`, configure both relay variables, redeploy, and move the webhook to `https://tg.hiiire.com/api/telegram/webhook`.

### Operator details (legal pages)

The details of the sole proprietor or company that operates the service are not stored in the repository. The `/terms`, `/privacy`, `/refund`, `/contact` and `/about` pages read them from server-side env on each request. The pages are rendered dynamically, so the values are not needed at `docker build` / `npm run build` time:

```env
LEGAL_OPERATOR_NAME=Индивидуальный предприниматель Иванов Иван Иванович   # required in production
LEGAL_OPERATOR_INN=000000000000                                            # required in production
LEGAL_OPERATOR_OGRN=000000000000000    # ОГРНИП (15 digits) or ОГРН (13 digits); the label on the page is chosen by length
LEGAL_OPERATOR_REGISTRATION_DATE=01.01.2025                                # optional, shown on /contact
```

`LEGAL_OPERATOR_NAME` is shown on the pages as is, so write it in Russian, the language of the pages. `INN`, `OGRN` and `OGRNIP` are Russian tax and state registration numbers.

If any required variable is missing, the pages render without the details block, and the web app logs `[legal] Operator requisites are not configured` in production. The public offer and the payment provider require these details, so set the variables before deploying.

### Robokassa billing (Starter/Professional)

For self-service checkout, the payment webhook and recurring payments:

```env
ROBOKASSA_MERCHANT_LOGIN=...   # required (or legacy ROBOKASSA_LOGIN)
ROBOKASSA_PASSWORD1=...        # required (checkout + recurring signature)
ROBOKASSA_PASSWORD2=...        # required (ResultURL signature verify)
CRON_SECRET=...                # required (/api/cron/billing-renewals)

# Optional (defaults shown):
ROBOKASSA_IS_TEST=true
ROBOKASSA_HASH_ALGORITHM=md5   # md5 | sha1 | sha256
ROBOKASSA_PAYMENT_URL=https://auth.robokassa.ru/Merchant/Index.aspx
ROBOKASSA_RECURRING_URL=https://auth.robokassa.ru/Merchant/Recurring
ROBOKASSA_RECURRING_ENABLED=false # safe default until recurring service is activated in Robokassa cabinet
```

After the recurring payments service is activated in the Robokassa account:
- set `ROBOKASSA_RECURRING_ENABLED=true`;
- make a test checkout and wait for a successful run of `POST /api/cron/billing-renewals`.

### Email notifications (Resend)

If you use email notifications and email broadcasts from the admin panel (`/admin/broadcast`):

```env
RESEND_API_KEY=re_...          # server-only
EMAIL_FROM=hiiire <noreply@yourdomain.com> # server-only
EMAIL_OWNER_RECIPIENTS=owner1@yourdomain.com,owner2@yourdomain.com # server-only (owners alerts)
```

In relay mode, register the Telegram webhook on the relay after deploying (once per environment):

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://tg.hiiire.com/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"]}"
```

Billing and notification cron jobs run from the system cron on the self-hosted Supabase VPS. The configuration is in `supabase/selfhost/`. The jobs call:
- `POST https://<your-host>/api/cron/billing-renewals`: recurring payments, daily retries, turning off `auto_renew` after the grace period.
- `POST https://<your-host>/api/cron/plan-expiry`: plan expiry notifications.

Cron runs at `09:00 UTC`, uses `flock`, makes up to three attempts and sends `x-cron-secret`, which must match the web app's `CRON_SECRET`.

> Note: `hiiire-web` and `hiiire-worker` **do not talk to each other over HTTP**; they connect through Supabase (Postgres):
> - the web app creates the candidate and puts a job in `jobs_ai` (`/api/candidates`, `/api/jobs`, `/api/vacancies`);
> - the worker claims the job, calls the AI provider, writes `ai_analyses`, updates `candidates` and marks the job `done` or `failed`.

---

## 2) Timeweb Cloud App: `hiiire-worker` (`jobs_ai` queue)

### Build / Start
- **Build command**: `npm run worker:build`
- **Start command**: `npm run worker:start`

> Note: `npm run worker:start` runs a selfcheck (`preworker:start`) with quick checks of the prompt injection sanitizer.
> The selfcheck runs from the already built `worker/dist` without rebuilding. The build happens in the Build step (`npm run worker:build`).

### Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=... # server-only

# Choose AI provider:
AI_PROVIDER=openai            # or: gemini | deepseek

# OpenAI (recommended)
OPENAI_API_KEY=...            # server-only
OPENAI_MODEL=gpt-5.2          # optional

# Gemini (legacy / optional)
GEMINI_API_KEY=...            # server-only
GEMINI_MODEL=gemini-2.5-flash # optional

# DeepSeek (V4) — high limits
DEEPSEEK_API_KEY=...          # server-only
DEEPSEEK_MODEL=deepseek-v4-flash # optional (or: deepseek-v4-pro)

# Candidate card prefill parser (web/API route, not worker)
DEEPSEEK_CANDIDATE_PARSER_MODEL=deepseek-v4-flash
DEEPSEEK_CANDIDATE_PARSER_MAX_TOKENS=3000
DEEPSEEK_CANDIDATE_PARSER_TIMEOUT_MS=6000
DEEPSEEK_CANDIDATE_PARSER_TOTAL_TIMEOUT_MS=12000
DEEPSEEK_CANDIDATE_PARSER_CONCURRENCY_LIMIT=1000
DEEPSEEK_CANDIDATE_PARSER_QUEUE_TIMEOUT_MS=3000

WORKER_POLL_MS=1000           # optional
WORKER_ID=hiiire-worker-1     # optional
WORKER_LOG_EGRESS_IP=true     # optional (diagnostics)

# PostHog worker telemetry (optional)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

When PostHog env is set on `hiiire-worker`, the worker sends the structured events `worker_started`, `ai_job_claimed`, `ai_job_completed`, `ai_job_failed`, `ai_job_requeued`, `ai_job_terminal_failed`, `hh_sync_failed`, as well as unhandled errors. Events never include resume text, vacancy descriptions, prompts, raw AI responses, HH tokens or raw HH payloads. `hh_sync_failed` contains only safe diagnostic fields: the error type, the normalized HH path (`/resumes/:id`, `/negotiations/:id`), query keys and pagination/status, without provider ids.

> Important: if Gemini is not available in your region, the worker is where it shows up. In that case, route the worker's outbound traffic through a VPN or proxy.
>
> In practice, choosing an app location in the panel (for example, Amsterdam) **does not guarantee** that Google will recognise the outbound (egress) IP as being in a supported region.
> - For diagnostics, enable egress IP logging: `WORKER_LOG_EGRESS_IP=true` (the worker prints its public IP on start).
> - `FAILED_PRECONDITION` / `User location is not supported...` is a **permanent** API availability error that retries do not fix. Change the egress (another host, NAT or a proxy in a supported country) or switch the AI provider.

---

## 3) Timeweb Cloud App: `hiiire-tika` (resume extraction)

`hiiire-tika` is deployed as a separate Timeweb app of type **Docker → Docker Compose**.

It consists of:

- the first service in `docker-compose.yml`: the protected Node/Fastify proxy;
- the second service: `apache/tika:${TIKA_IMAGE_TAG:-3.2.3.0}`;
- only the proxy is exposed;
- the `apache/tika` container must not be reachable directly from the internet.

The auth check must be attached to the Fastify route `onRequest` hook for `PUT /tika`, before body parsing and the upstream Tika call, rather than to a raw URL string comparison. `PUT /tika?probe=1` without auth must return `401`.

The proxy accepts only resume content types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`. `application/octet-stream` is accepted only together with a valid `x-hiiire-file-kind` (`pdf|doc|docx|txt`); any other or missing content type returns a safe `415`.

`GET /health` on the proxy checks the upstream Tika through the internal `TIKA_UPSTREAM_URL` and returns `503` until `apache/tika` is ready. This matters for Timeweb health checks and routing: the proxy is the public service, but it must not report ready before Tika is.

Timeweb Docker Compose deployments read **`docker-compose.yml` from the repository root**. That is why the root `docker-compose.yml` exists and is dedicated to the separate Tika app.

Important constraint: `hiiire-web` and `hiiire-worker` must not be moved to Docker Compose as part of this setup. If the UI or the worker is ever deployed with Docker Compose too, change the deployment layout first, so that a single root `docker-compose.yml` does not conflict between the Tika app and a web/worker compose deployment.

### Environment variables

```env
TIKA_AUTH_TOKEN=...            # required, checked by proxy
TIKA_UPSTREAM_URL=http://tika:9998
TIKA_UPSTREAM_TIMEOUT_MS=12000 # abort slow Tika upstream requests; keep below web TIKA_TIMEOUT_MS
TIKA_IMAGE_TAG=3.2.3.0         # pinned Apache Tika image tag; do not set latest
POSTHOG_KEY=phc_...            # optional but recommended
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_SERVICE_NAME=tika-proxy
NODE_ENV=production
```

### Observability

The proxy writes one-line structured JSON logs to stdout and sends only safe aggregated telemetry to PostHog. PostHog is not used as a raw log dump.

Never send to telemetry or logs:

- resume text;
- the bytes of the original file;
- extracted text;
- candidate contacts;
- the file name;
- the raw Tika response;
- request headers;
- authorization headers;
- auth tokens;
- stack traces;
- provider payloads;
- request/response bodies.

The `hiiire-tika` env must not contain Supabase, LLM/provider or worker secrets. The proxy exists only for auth, forwarding to `apache/tika`, structured logs and safe telemetry.

Errors are reduced to safe classes: `timeout`, `unauthorized`, `unsupported_content_type`, `upstream_error`, `upstream_response_too_large`, `network_error`.

---

## 4) Timeweb Cloud App: `hiiire-telegram-relay` (Telegram relay)

`hiiire-telegram-relay` is a standalone Node/Fastify app for Telegram webhook and send traffic. Deploy it in a non-RU Timeweb region and attach `tg.hiiire.com`.

Application settings:

- Project directory: `telegram-relay`
- Dockerfile: `telegram-relay/Dockerfile`
- Health check path: `/health`
- Dockerfile healthcheck: `curl -fsS http://127.0.0.1:8080/health || exit 1` (`HEALTHCHECK` in Dockerfile has priority over the panel path for Dockerfile deploys)
- Public domain: `tg.hiiire.com`

Do not add this service to the root `docker-compose.yml`. The root `docker-compose.yml` remains dedicated to Tika.

Environment variables:

```env
PORT=3000
NODE_ENV=production
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_RELAY_SECRET=...
TELEGRAM_REQUEST_TIMEOUT_MS=8000
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

After deploy, register the Telegram webhook:

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://tg.hiiire.com/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"]}"
```

Operator helpers:

```bash
npm run telegram:webhook -- set
npm run telegram:webhook -- get
```

For a local browser flow, open `scripts/telegram-webhook.html`, paste the bot token and webhook secret, then submit the form. It opens Telegram's JSON response in a new tab and does not store tokens in browser storage.

Then configure `hiiire-web`:

```env
TELEGRAM_RELAY_URL=https://tg.hiiire.com
TELEGRAM_RELAY_SECRET=...
TELEGRAM_REQUEST_TIMEOUT_MS=8000
```

For proxy mode, use `npm run telegram:webhook -- set --url https://hiiire.com/api/telegram/webhook` as described above. For direct mode, the CLI can register the same URL without `TELEGRAM_PROXY_URL`.

Do not set `TELEGRAM_PROXY_URL` in relay mode. Relay and proxy are explicit, mutually exclusive transports.

Verification:

1. `GET https://tg.hiiire.com/health` returns `200`.
2. Telegram `getWebhookInfo` shows `https://tg.hiiire.com/api/telegram/webhook`.
3. Dashboard Telegram connection creates a `telegram_user_links` row after `/start <token>`.
4. Admin broadcast to a test chat is delivered through the relay.

Rollback:

1. Remove `TELEGRAM_RELAY_URL` and `TELEGRAM_RELAY_SECRET` from `hiiire-web`.
2. Keep or restore `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and `TELEGRAM_WEBHOOK_SECRET` on `hiiire-web`.
3. Register Telegram webhook back to `https://hiiire.com/api/telegram/webhook`.
4. Trigger a test notification and confirm direct Telegram mode works.

---

## 5) Deploy on push

Timeweb Cloud App can rebuild the selected apps automatically on every push to a chosen branch. For `hiiire-tika`, auto-deploy must track a branch or commit that contains the root `docker-compose.yml` for the Tika app.

---

## 6) Database

Production uses self-hosted Supabase (Postgres + Auth + RLS + Storage) at `https://supabase.hiiire.com`. How to connect the web app, the worker, the Telegram relay, Auth SMTP/templates and cron is described in `supabase/selfhost/README.md`.

### Async AI queue (jobs_ai)

- In the production self-hosted Supabase this was applied by the recovery bootstrap together with the current queue and RPC migrations:
  - the `public.jobs_ai` table (new schema) was created;
  - the RPCs `public.claim_next_ai_job(worker_id)` and `public.finalize_ai_job(...)` were created;
  - the old table, if any, was kept as `public.jobs_ai_legacy`.
- For a new environment or project, use the SQL in `supabase/sql/ai_jobs.sql`.

### Candidate profile parser usage accounting

- The candidate card prefill parser runs in a web/API route and uses DeepSeek `deepseek-v4-flash` by default; the worker's resume analysis is unchanged.
- If DeepSeek is unavailable, misses the deadline or returns an unusable response, candidate creation continues with the regex fallback.
- Concurrency defaults: the UI runs up to 3 additions at once, the web parser allows up to 1000 parser requests per web instance, and the parser queue wait is 3 seconds.
- For a new environment or project, apply `supabase/sql/ai_usage_events.sql` through Supabase MCP after checking `project_ref` and `NEXT_PUBLIC_SUPABASE_URL`.
- `public.ai_usage_events` stores only safe usage accounting: ids, task/provider/model/status, attempts, token totals, duration and fallback reason. The table has no prompt, resume, raw output, contact, name, position, idempotency key/hash, provider payload, header or API key fields.
