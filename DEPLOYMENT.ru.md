# 🚀 Деплой hiiire на Timeweb Cloud App

[English](./DEPLOYMENT.md) | **Русский**

Этот проект разворачивается как отдельные приложения из одного репозитория:

- **`hiiire-web`**: Next.js приложение (UI + `app/api/*`)
- **`hiiire-worker`**: фоновый worker для очереди AI задач (`jobs_ai`)
- **`hiiire-tika`**: отдельный Docker Compose app для извлечения текста из файлов резюме (Node/Fastify proxy + `apache/tika`)
- **`hiiire-telegram-relay`**: отдельный relay для Telegram webhook и отправки сообщений на `tg.hiiire.com`; размещается за пределами России.

Это даёт стабильную обработку анализа резюме: пользователь может закрыть вкладку/потерять интернет — результат всё равно появится, потому что анализ выполняется worker’ом.

`hiiire-web` можно разворачивать либо текущим non-compose способом Timeweb App, либо через отдельный `Dockerfile.web`. `hiiire-worker` пока остаётся на non-compose настройках Timeweb App. `hiiire-tika` разворачивается отдельно через Docker Compose. `hiiire-telegram-relay` разворачивается отдельным Dockerfile-based Timeweb App.

---

## 1) Timeweb Cloud App: `hiiire-web` (Next.js)

### Сборка и запуск
- **Команда сборки**: `npm run build`
- **Команда запуска**: `npm run start`

### Docker-образ (необязательно)

Для Docker-hosting/VPS/Coolify можно собрать отдельный production image для web-приложения:

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

Запуск:

```bash
docker run --rm \
  --env-file .env.production \
  -p 3000:3000 \
  hiiire-web
```

`Dockerfile.web` использует Next.js standalone output и запускает сгенерированный `server.js` на `0.0.0.0:3000`. `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` обязательны на этапе `docker build`; остальные `NEXT_PUBLIC_*` build args опциональны. Браузерная часть Next.js встраивает public env в bundle. Эти же значения нужно передать в runtime env, потому что server/API routes тоже читают Supabase/PostHog env во время работы.

Контейнерный healthcheck проверяет `GET /api/health`.

Корневой `docker-compose.yml` не используется для `hiiire-web`: он остаётся отдельным compose-deploy для `hiiire-tika`.

### Переменные окружения
Минимум:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Для режима Supabase + async AI (обязательно, т.к. `app/api/*` создаёт jobs и вакансии server-side):

```env
SUPABASE_SERVICE_ROLE_KEY=... # server-only
AUTH_VERIFICATION_CONTEXT_SECRET=... # server-only, strongly recommended for verify-email context cookie signing
APP_ORIGIN=https://your-production-domain.com # optional, but recommended when app runs behind reverse proxy
```

> Рекомендуется задать `AUTH_VERIFICATION_CONTEXT_SECRET` отдельным длинным случайным секретом.  
> Если переменная не задана, приложение использует fallback на `SUPABASE_SERVICE_ROLE_KEY`.

### Аналитика PostHog (необязательно)

Для продуктовой аналитики и server error tracking:

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Если `NEXT_PUBLIC_POSTHOG_KEY` не задан, приложение работает без PostHog. Server-side ошибки Next.js отправляются через `instrumentation.ts`; request headers не передаются в PostHog.

### Извлечение текста резюме через Tika

Для загрузки резюме файлом после Tika rollout web-приложению нужен доступ к защищённому Tika proxy:

```env
TIKA_BASE_URL=https://your-tika-proxy.example.com
TIKA_AUTH_TOKEN=...            # server-only, must match the proxy token
TIKA_TIMEOUT_MS=20000          # optional; keep greater than proxy TIKA_UPSTREAM_TIMEOUT_MS
```

Web app отправляет файл в Tika proxy, получает plain text и сохраняет его в `candidates.resume_text`. Если пользователь сохраняет оригинальный файл, он по-прежнему хранится в Supabase Storage; Tika не заменяет storage и не имеет доступа к БД.

Ограничения загрузки после Tika rollout остаются формато-независимыми: файл до 5 MB, извлечённый текст до 50,000 символов / 8,000 слов, минимум 20 символов, timeout web-запроса и timeout upstream-запроса proxy. Web timeout должен быть больше proxy upstream timeout, чтобы proxy успевал вернуть классифицированный `504`/`503`, а web не обрывал запрос раньше. Старый PDF-only лимит на количество страниц не применяется.

Для сохранения `.doc` файлов bucket `resumes` должен включать `application/msword` в `allowed_mime_types`. Это проверяется и обновляется через Supabase MCP после сверки MCP `project_ref` с `NEXT_PUBLIC_SUPABASE_URL`; SQL или ручные обходные изменения для bucket-настроек не используются.

### Telegram-бот (только webhook)

Если используете Telegram-бота для уведомлений/рассылки:

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
CRON_SECRET=...                # server-only (для /api/cron/*)
```

`hiiire-web` считает ошибкой конфигурацию, где заданы одновременно `TELEGRAM_RELAY_URL` и `TELEGRAM_PROXY_URL`. Если не задана ни одна из них, приложение обращается к Telegram напрямую.

#### Telegram через HTTP(S)-прокси

Режим proxy касается только исходящих вызовов Bot API: `sendMessage`, `setWebhook`, `getWebhookInfo` и т.п. Входящий webhook он доступным не делает: Telegram должен иметь возможность отправлять HTTPS-запросы на `https://hiiire.com/api/telegram/webhook`.

Настройте `hiiire-web`:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_OWNER_CHAT_IDS=123,456
TELEGRAM_PROXY_URL=http://user:password@proxy.example.com:8080
TELEGRAM_REQUEST_TIMEOUT_MS=8000
```

URL прокси поддерживает `http://` и `https://`, в том числе логин и пароль Basic Auth в percent-encoded виде. Path, query, fragment и SOCKS-схемы отклоняются. Значение должно оставаться только на сервере.

Зарегистрируйте и проверьте webhook через прокси:

```bash
npm run telegram:webhook -- set --url https://hiiire.com/api/telegram/webhook
npm run telegram:webhook -- get
```

CLI читает `TELEGRAM_PROXY_URL`; `--proxy-url <url>` нужен только для разового переопределения. Затем проверьте `/start <token>` с тестового аккаунта и отправьте тестовое уведомление. Чтобы вернуться в прямой режим, удалите `TELEGRAM_PROXY_URL` и передеплойте. Чтобы перейти в режим relay, удалите `TELEGRAM_PROXY_URL`, задайте обе relay-переменные, передеплойте и перенесите webhook на `https://tg.hiiire.com/api/telegram/webhook`.

### Реквизиты оператора (юридические страницы)

Реквизиты ИП / юрлица не хранятся в репозитории. Страницы `/terms`, `/privacy`, `/refund`, `/contact` и `/about` читают их из server-side env во время запроса (страницы рендерятся динамически, поэтому значения не нужны на этапе `docker build` / `npm run build`):

```env
LEGAL_OPERATOR_NAME=Индивидуальный предприниматель Иванов Иван Иванович   # required в production
LEGAL_OPERATOR_INN=000000000000                                            # required в production
LEGAL_OPERATOR_OGRN=000000000000000    # ОГРНИП (15 цифр) или ОГРН (13 цифр); подпись на странице выбирается по длине
LEGAL_OPERATOR_REGISTRATION_DATE=01.01.2025                                # optional, показывается на /contact
```

Если хотя бы одна обязательная переменная не задана, страницы открываются без блока реквизитов, а в production-логах web появляется ошибка `[legal] Operator requisites are not configured`. Публичная оферта и данные для платёжного провайдера должны содержать реквизиты, поэтому задайте переменные до деплоя.

### Оплата через Robokassa (Starter/Professional)

Для self-service checkout + webhook + recurring:

```env
ROBOKASSA_MERCHANT_LOGIN=...   # required (или legacy ROBOKASSA_LOGIN)
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

После активации сервиса рекуррентных платежей в кабинете Robokassa переключите:
- `ROBOKASSA_RECURRING_ENABLED=true`
- выполните контрольный checkout + дождитесь успешного прохода `POST /api/cron/billing-renewals`

### Email-уведомления (Resend)

Если используете email-уведомления и email-рассылку из админки (`/admin/broadcast`):

```env
RESEND_API_KEY=re_...          # server-only
EMAIL_FROM=hiiire <noreply@yourdomain.com> # server-only
EMAIL_OWNER_RECIPIENTS=owner1@yourdomain.com,owner2@yourdomain.com # server-only (owners alerts)
```

Для relay mode после деплоя настройте webhook у Telegram на relay (один раз на окружение):

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://tg.hiiire.com/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"]}"
```

Cron для биллинга/уведомлений выполняется системным cron на self-hosted
Supabase VPS. Конфигурация лежит в `supabase/selfhost/`. Задачи вызывают:
- `POST https://<your-host>/api/cron/billing-renewals` — recurring-платежи, daily retry, отключение `auto_renew` после grace.
- `POST https://<your-host>/api/cron/plan-expiry` — уведомления об истечении тарифа.

Cron запускается в `09:00 UTC`, использует `flock`, делает до трёх попыток и
передаёт `x-cron-secret`, совпадающий с `CRON_SECRET` веб-приложения.

> Примечание: `hiiire-web` и `hiiire-worker` **не общаются напрямую по HTTP** — они “стыкуются” через Supabase (Postgres):
> - web создаёт кандидата и ставит job в `jobs_ai` (`/api/candidates`, `/api/jobs`, `/api/vacancies`)
> - worker забирает job, вызывает Gemini, пишет `ai_analyses` + обновляет `candidates`, переводит job в `done/failed`

---

## 2) Timeweb Cloud App: `hiiire-worker` (очередь `jobs_ai`)

### Сборка и запуск
- **Команда сборки**: `npm run worker:build`
- **Команда запуска**: `npm run worker:start`

> Примечание: `npm run worker:start` запускает selfcheck (`preworker:start`), который прогоняет быстрые проверки санитайзера prompt injection.  
> Selfcheck запускается из уже собранного `worker/dist` (без повторной сборки). Сборка происходит на шаге Build (`npm run worker:build`).

### Переменные окружения

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

Если PostHog env задан в `hiiire-worker`, worker отправляет структурированные события `worker_started`, `ai_job_claimed`, `ai_job_completed`, `ai_job_failed`, `ai_job_requeued`, `ai_job_terminal_failed`, `hh_sync_failed`, а также unhandled errors. В события не передаются тексты резюме, описания вакансий, промпты, raw-ответы AI, HH tokens или raw HH payloads. Для `hh_sync_failed` допускаются только безопасные диагностические поля: тип ошибки, нормализованный HH path (`/resumes/:id`, `/negotiations/:id`), ключи query и pagination/status без provider ids.

> Важно: если Gemini недоступен из вашего региона, это проявится именно в worker’е. В этом случае обеспечьте worker’у egress через VPN/proxy.
>
> Практика: выбор локации приложения в панели (например, Amsterdam) **не гарантирует**, что исходящий IP (egress) будет гео-распознан Google как поддерживаемый.
> - Для диагностики можно включить лог egress IP: `WORKER_LOG_EGRESS_IP=true` (worker при старте выведет публичный IP).
> - Если видите `FAILED_PRECONDITION` / `User location is not supported...` — это **перманентная** ошибка доступности API (не лечится ретраями), нужно менять egress (другой хостинг/NAT/proxy в поддерживаемой стране) или менять AI-провайдера.

---

## 3) Timeweb Cloud App: `hiiire-tika` (извлечение текста резюме)

`hiiire-tika` разворачивается как отдельное приложение Timeweb типа **Docker → Docker Compose**.

Состав:

- первый сервис в `docker-compose.yml`: защищённый Node/Fastify proxy;
- второй сервис: `apache/tika:${TIKA_IMAGE_TAG:-3.2.3.0}`;
- наружу публикуется только proxy;
- контейнер `apache/tika` не должен быть доступен напрямую из интернета.

Проверка auth должна быть привязана к Fastify route `onRequest` для `PUT /tika`, до парсинга body и upstream Tika, а не к raw URL string equality. `PUT /tika?probe=1` без auth должен возвращать `401`.

Proxy принимает только resume content types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`. `application/octet-stream` разрешён только вместе с валидным `x-hiiire-file-kind` (`pdf|doc|docx|txt`); остальные или отсутствующие content-type возвращают безопасный `415`.

`GET /health` на proxy проверяет доступность upstream Tika через внутренний `TIKA_UPSTREAM_URL` и возвращает `503`, пока `apache/tika` ещё не готов. Это важно для Timeweb health/routing: публичным считается proxy, но он не должен выглядеть готовым раньше Tika.

Timeweb Docker Compose deploy читает файл **`docker-compose.yml` из корня репозитория**. Поэтому Tika branch/deploy содержит корневой `docker-compose.yml`, предназначенный только для отдельного Tika App.

Важное ограничение: текущие `hiiire-web` и `hiiire-worker` не должны переводиться на Docker Compose в рамках этого rollout. Если в будущем UI или worker тоже будут деплоиться через Docker Compose, нужно заранее изменить deployment layout, чтобы один корневой `docker-compose.yml` не конфликтовал между Tika App и web/worker compose-деплоем.

### Переменные окружения

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

### Наблюдаемость

Proxy пишет one-line structured JSON logs в stdout и отправляет в PostHog только безопасную агрегированную telemetry. PostHog не используется как сырой лог-дамп.

В telemetry/logs нельзя отправлять:

- текст резюме;
- bytes оригинального файла;
- извлечённый текст;
- контакты кандидата;
- имя файла;
- raw Tika response;
- request headers;
- authorization headers;
- auth tokens;
- stack traces;
- provider payloads;
- request/response bodies.

`hiiire-tika` env не должен содержать Supabase, LLM/provider или worker secrets. Proxy нужен только для auth, forwarding в `apache/tika`, structured logs и безопасной telemetry.

Ошибки сводятся к безопасным классам: `timeout`, `unauthorized`, `unsupported_content_type`, `upstream_error`, `upstream_response_too_large`, `network_error`.

---

## 4) Timeweb Cloud App: `hiiire-telegram-relay` (Telegram relay)

`hiiire-telegram-relay` — отдельное Node/Fastify-приложение для входящего webhook Telegram и отправки сообщений. Разверните его в регионе Timeweb за пределами России и привяжите домен `tg.hiiire.com`.

Настройки приложения:

- Project directory: `telegram-relay`
- Dockerfile: `telegram-relay/Dockerfile`
- Health check path: `/health`
- Healthcheck в Dockerfile: `curl -fsS http://127.0.0.1:8080/health || exit 1` (при деплое из Dockerfile `HEALTHCHECK` в Dockerfile важнее пути, указанного в панели)
- Публичный домен: `tg.hiiire.com`

Не добавляйте этот сервис в корневой `docker-compose.yml`: он остаётся только для Tika.

Переменные окружения:

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

После деплоя зарегистрируйте webhook Telegram:

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://tg.hiiire.com/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"]}"
```

Команды для оператора:

```bash
npm run telegram:webhook -- set
npm run telegram:webhook -- get
```

То же можно сделать в браузере: откройте `scripts/telegram-webhook.html`, вставьте токен бота и webhook secret и отправьте форму. JSON-ответ Telegram откроется в новой вкладке; токены в хранилище браузера не сохраняются.

Затем настройте `hiiire-web`:

```env
TELEGRAM_RELAY_URL=https://tg.hiiire.com
TELEGRAM_RELAY_SECRET=...
TELEGRAM_REQUEST_TIMEOUT_MS=8000
```

Для proxy mode используйте `npm run telegram:webhook -- set --url https://hiiire.com/api/telegram/webhook`, как описано выше. Для direct mode тот же URL можно зарегистрировать CLI без `TELEGRAM_PROXY_URL`.

В режиме relay не задавайте `TELEGRAM_PROXY_URL`: relay и proxy — взаимоисключающие способы доступа к Telegram, каждый включается явно.

Проверка:

1. `GET https://tg.hiiire.com/health` возвращает `200`.
2. `getWebhookInfo` в Telegram показывает `https://tg.hiiire.com/api/telegram/webhook`.
3. Подключение Telegram в дашборде после `/start <token>` создаёт строку в `telegram_user_links`.
4. Рассылка из админки в тестовый чат доходит через relay.

Откат (rollback):

1. Удалите `TELEGRAM_RELAY_URL` и `TELEGRAM_RELAY_SECRET` из `hiiire-web`.
2. Оставьте или верните `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` и `TELEGRAM_WEBHOOK_SECRET` в `hiiire-web`.
3. Зарегистрируйте webhook Telegram обратно на `https://hiiire.com/api/telegram/webhook`.
4. Отправьте тестовое уведомление и убедитесь, что прямой режим работает.

---

## 5) Автодеплой по коммитам

Timeweb Cloud App можно настроить так, чтобы нужные приложения автоматически пересобирались при push в выбранную ветку. Для `hiiire-tika` автодеплой должен смотреть на ветку/коммит, где есть корневой `docker-compose.yml` для Tika App.

---

## 6) База данных

Production использует self-hosted Supabase (Postgres + Auth + RLS + Storage)
по адресу `https://supabase.hiiire.com`. Инструкция по подключению web, worker,
Telegram relay, Auth SMTP/templates и cron находится в
`supabase/selfhost/README.md`.

### Асинхронная очередь AI (jobs_ai)

- В production self-hosted Supabase это применено recovery bootstrap вместе с
  актуальными queue/RPC-миграциями:
  - создана таблица `public.jobs_ai` (новая схема)
  - созданы RPC: `public.claim_next_ai_job(worker_id)` и `public.finalize_ai_job(...)`
  - старая таблица (если была) сохранена как `public.jobs_ai_legacy`
- Для нового окружения/проекта используйте SQL: `supabase/sql/ai_jobs.sql`

### Учёт запросов парсера карточки кандидата

- Parser предзаполнения карточки кандидата работает в web/API route и по умолчанию использует DeepSeek `deepseek-v4-flash`; worker AI-анализ резюме остаётся без изменений.
- Если DeepSeek недоступен, превышает deadline или возвращает неподходящий ответ, создание кандидата продолжается через regex fallback.
- Concurrency defaults: UI запускает до 3 добавлений одновременно, web parser допускает до 1000 parser-запросов на один web-инстанс, ожидание parser queue — 3 секунды.
- Для нового окружения/проекта примените `supabase/sql/ai_usage_events.sql` через Supabase MCP после проверки `project_ref` и `NEXT_PUBLIC_SUPABASE_URL`.
- `public.ai_usage_events` хранит только безопасный usage accounting: ids, task/provider/model/status, attempts, token totals, duration and fallback reason. В таблице нет prompt/resume/raw output/contact/name/position/idempotency key/hash/provider payload/header/API key fields.
