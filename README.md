# hiiire.com - Умный подбор персонала с AI

![hiiire](./.project_documentation_and_meta/hiiire_main_logo_with_background.png)

**Автоматизируйте подбор персонала с помощью AI**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

> Open-source AI-powered recruiting CRM (Next.js + Supabase) with HH.ru integration, AI resume scoring and an HR assistant. The UI and documentation are in Russian.

Исходный код открыт под лицензией [GNU AGPL-3.0](./LICENSE). Хотите помочь — начните с [CONTRIBUTING.md](./CONTRIBUTING.md); об уязвимостях сообщайте по [SECURITY.md](./SECURITY.md).

---

## 📋 О проекте

hiiire.com - это платформа для HR и рекрутеров, которая упрощает процесс подбора персонала с помощью искусственного интеллекта.

### Ключевые возможности

- 🔗 **Интеграция с HH.ru** - Автоматический импорт откликов
- 🤖 **AI анализ резюме** - Скоринг **соответствия вакансии** (%)
- **HR-ассистент** - Чаты внутри CRM, поиск по рабочему контексту и действия с подтверждением
- 🧪 **QA-ассистент** - Проверка кейсов тестирования по `docs/For_juniors/hiiire_for_junior.md`
- 📅 **Календарь собеседований** - планирование, перенос, отмена и завершение собеседований внутри hiiire
- 📄 **PDF-инструменты для HR** - публичная страница `/pdf-tools` ведёт на бесплатный редактор на `https://pdf.hiiire.com`.
- 💡 **Советы по вакансиям** - AI оптимизация описаний вакансий
- Поддержка светлой, темной и системной темы для рабочих разделов приложения.

---

## Контент, SEO и GEO

Публичные материалы живут в репозитории:

- блог: `content/blog/*.md`
- база знаний: `content/knowledge-base/*.md`

Структура материала хранится во frontmatter, основной текст — в Markdown. Публикация идёт через обычную ветку и PR; прямого сохранения в production из CMS нет.

Локально platform admin может открыть `/admin/content` и редактировать материалы через Sveltia. Превью в Sveltia помогает при написании, но финально материал нужно смотреть на реальном локальном маршруте: `/blog/<slug>` или `/knowledge-base/<slug>`.

Проверки контента:

```bash
npm run content:check
npm run content:lint
npm run test:content
npm run content:quality
```

`content:check` проверяет frontmatter, связи, sitemap/RSS/llms/IndexNow-контракты. `content:lint` добавляет публичные routes и CMS/navigation contracts.
`content:quality` выводит SEO/GEO предупреждения для редактора без блокировки публикации по умолчанию.

После релиза можно отправить публичные URL в IndexNow:

```bash
APP_ORIGIN=https://hiiire.com INDEXNOW_KEY=<key> npm run content:indexnow
```

Полный процесс описан в [`docs/content-workflow.md`](./docs/content-workflow.md).

## 🤖 Telegram-бот (webhook-only) — уведомления и рассылка

В проекте есть Telegram-бот, который работает **только через webhook** (без polling) и закрывает 3 сценария:

- **Владельцы продукта**: уведомления о новых регистрациях, новых заявках с лендинга и о событиях биллинга (оплаты/проблемы продления).
- **Клиенты** (company **admin**, подключившие бота): уведомления об **успешных оплатах**, **начислениях credits**, **истечении тарифа**.
- **Админка платформы**: страница рассылки — `/admin/broadcast` (Telegram + Email).

### Как пользователь подключает бота

1. Открывает `Dashboard → Настройки → Уведомления → Telegram`
2. Нажимает **«Подключить Telegram»** → генерируется одноразовая ссылка (deep-link)
   - ссылка открывается **в новой вкладке** (если попапы запрещены — появится кнопка “Открыть Telegram”)
3. В Telegram нажимает **Start** (команда `/start <token>`) — после этого `chat_id` привязывается к его `profiles.id`

Отключение связки: кнопка **«Отключить Telegram»** или команда в боте `/unlink`.

Отдельно от связки можно **выключить/включить Telegram‑уведомления** (переключатель “Telegram‑уведомления”). Это сохраняет `chat_id`, но бот перестаёт присылать сообщения, пока настройка выключена.
Переключатель показывается **только когда Telegram уже подключен**; в состоянии «не подключено» отображаются статус и кнопка **«Подключить Telegram»** без плашки с тогглом.

### UX заметка: обновление статуса подключения

Экран настроек автоматически обновляет статус Telegram:
- при открытии вкладки “Уведомления”
- при возврате в окно/вкладку (event `focus`)
- коротким polling после нажатия “Подключить” (чтобы статус быстро обновился после `/start`)

Также есть ручное обновление через **иконку Refresh** рядом со статусом (fallback).

### Telegram relay or HTTP(S) proxy for Bot API access

Production Telegram traffic can use the standalone relay on `tg.hiiire.com` or an HTTP(S) forward proxy configured in `hiiire-web`. Do not configure relay and proxy mode at the same time.

#### Relay mode

- Telegram webhook URL: `https://tg.hiiire.com/api/telegram/webhook`
- Relay app directory in this repo: `telegram-relay`
- Timeweb project directory: `telegram-relay`
- Timeweb health check: `/health`
- Dockerfile: `telegram-relay/Dockerfile`
- Dockerfile healthcheck: `curl -fsS http://127.0.0.1:8080/health || exit 1`

Main web app env for relay mode:

```env
TELEGRAM_RELAY_URL=https://tg.hiiire.com
TELEGRAM_RELAY_SECRET=...
TELEGRAM_REQUEST_TIMEOUT_MS=8000
```

Relay app env:

```env
PORT=3000
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_RELAY_SECRET=...
TELEGRAM_REQUEST_TIMEOUT_MS=8000
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Register webhook against the relay:

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

There is also a local browser form at `scripts/telegram-webhook.html`. Open it from the repo, paste the bot token and webhook secret, and submit the form; it uses a native POST form to Telegram instead of browser `fetch`.

Rollback:

1. Remove `TELEGRAM_RELAY_URL` and `TELEGRAM_RELAY_SECRET` from the SPB web app.
2. Keep or restore `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and `TELEGRAM_WEBHOOK_SECRET` on the SPB web app.
3. Register webhook back to `https://hiiire.com/api/telegram/webhook`.
4. Send a test notification and confirm direct Telegram mode works.

#### Proxy mode

Proxy mode sends only outbound Telegram Bot API requests through an HTTP(S) forward proxy. Incoming Telegram updates do not travel through this proxy: `https://hiiire.com/api/telegram/webhook` must remain publicly reachable by Telegram over HTTPS.

Configure `hiiire-web` without `TELEGRAM_RELAY_URL` and `TELEGRAM_RELAY_SECRET`:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_PROXY_URL=http://user:password@proxy.example.com:8080
TELEGRAM_REQUEST_TIMEOUT_MS=8000
```

Supported proxy schemes are `http://` and `https://`. The URL may contain percent-encoded credentials, but must not contain a path, query, or fragment. `TELEGRAM_PROXY_URL` is server-only and must not be written to logs or exposed to the browser. SOCKS proxy URLs are not supported.

Register and inspect the direct webhook through the same proxy:

```bash
npm run telegram:webhook -- set --url https://hiiire.com/api/telegram/webhook
npm run telegram:webhook -- get
```

The CLI reads `TELEGRAM_PROXY_URL`; `--proxy-url <url>` can override it for a single command. The browser form in `scripts/telegram-webhook.html` uses the browser's own network path and does not read the server-side proxy setting.

Verify that `getWebhookInfo` shows `https://hiiire.com/api/telegram/webhook`, `/start <token>` connects a test account, and a test notification is delivered. To return to direct mode, remove `TELEGRAM_PROXY_URL` and redeploy. To return to relay mode, remove `TELEGRAM_PROXY_URL`, set both relay variables, and register the webhook on `https://tg.hiiire.com/api/telegram/webhook`.

### Endpoints (важное)

### Browser → Supabase Boundary

Браузерная часть приложения не должна обращаться к `*.supabase.co` напрямую. Auth, списки вакансий/кандидатов, профили, статусы AI-задач, контакты кандидатов и welcome-flow идут через same-origin `/api/*` маршруты hiiire; эти маршруты уже на сервере используют Supabase session/admin clients и project guards.

Календарь не открывает browser Supabase Realtime/WebSocket. Актуальность календаря проверяется через `/api/interviews/changes`, поэтому изменения в другой вкладке или у другого пользователя могут появляться с небольшой polling-задержкой.

- `POST /api/telegram/webhook` — webhook Telegram (защищён заголовком `X-Telegram-Bot-Api-Secret-Token`)
- `POST /api/telegram/connect-link` — создать одноразовую ссылку подключения
- `GET /api/telegram/status` — статус подключения
- `POST /api/telegram/preferences` — включить/выключить Telegram‑уведомления (без отключения связки)
- `POST /api/telegram/disconnect` — отключить
- `POST /api/cron/plan-expiry` — cron для уведомлений об истечении тарифа (защищён `x-cron-secret`)
- `POST /api/billing/checkout` — создать pending payment и получить redirect в Robokassa (company admin only)
- `POST /api/billing/credit-topup` — создать или переиспользовать pending одноразовую оплату пополнения AI-кредитов без смены тарифа (company admin only)
- `GET /api/billing/credit-topup-result?invId=...` — проверить серверный статус оплаты пополнения после возврата из Robokassa
- `GET/POST /api/billing/plan-change-request` — получить активную заявку на смену тарифа или создать новую ручную заявку (company admin only для POST)
- `POST /api/billing/robokassa-webhook` — ResultURL webhook Robokassa: финализирует Starter/Professional payments и одноразовые пополнения credits, а если `InvId` относится к Enterprise manual invoice, переводит только invoice в `paid` без автоматической активации agreement
- `POST /api/billing/manual-invoice-webhook` — совместимый отдельный webhook для Enterprise manual invoices, если он настроен в Robokassa как отдельный ResultURL
- `POST /api/cron/billing-renewals` — daily cron для recurring-платежей (защищён `x-cron-secret`)
- `POST /api/candidates` — создать кандидата из текста или файла резюме (`multipart/form-data` для PDF/DOC/DOCX/TXT, `application/json` для текста; файл до 5MB, извлечённый текст до 50 000 символов / 8 000 слов); повторные одинаковые запросы с тем же `X-Idempotency-Key` не создают дубль кандидата и не резервируют кредиты повторно
- `GET /api/candidates/resume-download?candidateId=...` — скачать сохранённый файл резюме кандидата как attachment; для HH.ru-кандидатов по кнопке резюме остаётся внешняя ссылка на HH
- `GET /api/dashboard/activity?page=1&pageSize=25&type=all` — лента активности dashboard с фильтрами `all|candidates|vacancies|credits`; возвращает страницу событий и метаданные пагинации. Создание вакансий/кандидатов видно по ролевому скоупу, а списания кредитов за AI-анализ видны всем пользователям компании без раскрытия email автора списания.
- `POST /api/vacancies` — создать вакансию; `salaryCurrency` принимает только поддерживаемый ISO 4217 код валюты; `salaryMin/salaryMax` принимают только целые числовые значения, допускают максимум **15 цифр** (`<= 999_999_999_999_999`), а `salaryMin` не может быть больше `salaryMax`
- `PATCH /api/vacancies/:id` — обновить вакансию; `salaryCurrency` принимает только поддерживаемый ISO 4217 код валюты; `salaryMin/salaryMax` принимают только целые числовые значения, допускают максимум **15 цифр** (`<= 999_999_999_999_999`), а `salaryMin` не может быть больше `salaryMax`
- `PATCH /api/vacancies/:id/status` — быстрое обновление статуса вакансии (`draft|active|paused|closed`)
- `POST /api/qa-chat` — QA-ассистент для тестировщиков (доступ только для авторизованных пользователей)

Для `POST /api/vacancies`, `PATCH /api/vacancies/:id` и `PATCH /api/company` при невалидном body сервер возвращает `400` в формате:

```json
{
  "error": "INVALID_BODY",
  "message": "Введите сумму цифрами",
  "issues": [
    {
      "path": ["salaryMin"],
      "message": "Введите сумму цифрами"
    }
  ]
}
```

### Form and API Error Copy Policy

- User-facing form errors must be short Russian messages that tell the user what to change.
- API routes that reject invalid input return `400` with `{ error, message?, issues? }`; clients show `message` or the first safe `issues[].message`, never raw technical codes such as `INVALID_BODY`, `Too big`, `Too small`, stack traces, or provider/internal errors.
- Client forms mirror critical server limits with `maxLength`, input guards, and inline validation so common mistakes are caught before submit.
- Long user-entered text in cards, lists, popovers, and select items must use `min-w-0`, `truncate` or `break-words`; adjacent icons/buttons must keep stable dimensions with `shrink-0`.

### HR-ассистент

Маршрут в дашборде: `/dashboard/hr-assistant`.

Доступ к разделу открыт только для компаний с активным тарифом `Trial`, `Starter`, `Professional` или `Enterprise`. Если тариф не активен, вместо чата показывается заглушка с переходом в настройки тарифа; API HR-ассистента возвращают `403` с безопасным пользовательским сообщением.

Обязательная переменная окружения для live-вызовов модели:

- `DEEPSEEK_API_KEY`

Опциональные переопределения моделей:

- `HR_ASSISTANT_DEEPSEEK_MODEL`, по умолчанию `deepseek-v4-flash`
- `HR_ASSISTANT_DEEPSEEK_PRO_MODEL`, по умолчанию `deepseek-v4-pro`

Live-чат HR-ассистента использует complex-вариант модели (`HR_ASSISTANT_DEEPSEEK_PRO_MODEL`).

Ассистент использует текущую роль пользователя в hiiire и не обходит правила доступа CRM. Чтение и изменения ограничены компанией, ролью и доступом пользователя к вакансиям и кандидатам. Действия, которые меняют CRM-данные, требуют подтверждения; будущие внешние действия, например отправка писем или публикация в HH.ru, остаются заблокированными до отдельного продуктового сценария.

Для календарных вопросов с относительными датами ассистент не вычисляет время по модели. Клиент передаёт timezone браузера, сервер добавляет текущий момент, а ассистент сначала вызывает `resolve_calendar_time` и только потом использует полученные `fromIso`/`toIso` для поиска собеседований. Поэтому запросы вроде «что у меня сегодня», «что завтра» и «на этой неделе» считаются по локальному календарному дню пользователя, как события отображаются в `/dashboard/calendar`, а не по UTC-дню сохранённого `scheduled_at`.

Список чатов поддерживает поиск по названию и тексту сообщений. Поиск включает архивные чаты; архивные результаты помечаются в списке. Чаты можно архивировать, возвращать из архива и закреплять вверху списка. Новый чат сначала создаётся с временным названием `Новый чат`, а после первого сообщения пользователя получает короткое название из этого сообщения.

При запросах списков кандидатов, вакансий и интервью ассистент получает страницу доступных записей и метаданные по этому же доступному скоупу: фильтры, лимит страницы, `hasMore`, курсор следующей страницы, scope и агрегаты там, где они есть. Поэтому ответ не должен выдавать первую страницу за весь список CRM; если нужны все результаты, ассистент должен продолжать по курсору или предложить сузить запрос.

В ответах пользователю ассистент называет статусы кандидатов, вакансий и собеседований так же, как UI: например, **«Рассмотрение»**, **«Активна»**, **«Запланировано»**. Сырые значения `status` остаются только техническими значениями для фильтров и API-контрактов.

Когда ассистент ссылается на конкретного кандидата или вакансию, он может дать ссылку на dashboard. Ссылки открываются в новой вкладке и раскрывают правую карточку деталей по URL-параметрам `/dashboard/candidates?candidate=...` и `/dashboard/vacancies?vacancy=...`, даже если запись не попала на текущую страницу списка.

### Автозаполнение карточки кандидата из резюме

При создании кандидата из файла или текстового описания web/API route может использовать DeepSeek `deepseek-v4-flash` для предзаполнения имени, должности, контактов и желаемой зарплаты. Желаемая зарплата сохраняется в структурированных полях `candidates.desired_salary_*`, а не вычисляется в UI из текста резюме. Если DeepSeek недоступен, отвечает слишком долго или возвращает неподходящий результат, создание кандидата продолжается через regex fallback; worker AI-анализ резюме и очередь `jobs_ai` остаются отдельным процессом.

Ограничения по умолчанию: до 3 одновременных добавлений в UI, до 1000 parser-запросов на один web-инстанс, ожидание очереди parser-запроса до 3 секунд. Учёт расхода parser-запросов пишется в `public.ai_usage_events`: сохраняются только company/user/candidate/request ids, task/provider/model/status, attempts, token totals, duration and fallback reason. В таблицу, логи и product analytics не пишутся промпты, текст резюме, raw-ответ модели, контакты, имена, должности, idempotency key/hash, provider payloads, headers или API keys.

### Переменные окружения

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...      # без @
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_OWNER_CHAT_IDS=123,456
# Choose one optional Telegram transport:
TELEGRAM_RELAY_URL=https://tg.hiiire.com
TELEGRAM_RELAY_SECRET=...
# TELEGRAM_PROXY_URL=http://user:password@proxy.example.com:8080
TELEGRAM_REQUEST_TIMEOUT_MS=8000
CRON_SECRET=...

# Email notifications (Resend)
RESEND_API_KEY=re_...
EMAIL_FROM=hiiire <noreply@yourdomain.com>
EMAIL_OWNER_RECIPIENTS=owner1@yourdomain.com,owner2@yourdomain.com

# HR assistant live model calls
DEEPSEEK_API_KEY=...
HR_ASSISTANT_DEEPSEEK_MODEL=deepseek-v4-flash
HR_ASSISTANT_DEEPSEEK_PRO_MODEL=deepseek-v4-pro

# Candidate card prefill parser (web/API route)
DEEPSEEK_CANDIDATE_PARSER_MODEL=deepseek-v4-flash
DEEPSEEK_CANDIDATE_PARSER_MAX_TOKENS=3000
DEEPSEEK_CANDIDATE_PARSER_TIMEOUT_MS=6000
DEEPSEEK_CANDIDATE_PARSER_TOTAL_TIMEOUT_MS=12000
DEEPSEEK_CANDIDATE_PARSER_CONCURRENCY_LIMIT=1000
DEEPSEEK_CANDIDATE_PARSER_QUEUE_TIMEOUT_MS=3000

# Robokassa billing (server-only)
ROBOKASSA_MERCHANT_LOGIN=...
ROBOKASSA_PASSWORD1=...
ROBOKASSA_PASSWORD2=...
ROBOKASSA_IS_TEST=true               # true/false; default=true
ROBOKASSA_HASH_ALGORITHM=md5         # md5|sha1|sha256; default=md5
ROBOKASSA_PAYMENT_URL=https://auth.robokassa.ru/Merchant/Index.aspx
ROBOKASSA_RECURRING_URL=https://auth.robokassa.ru/Merchant/Recurring
ROBOKASSA_RECURRING_ENABLED=false    # true/false; default=false (safe fallback until recurring is activated)
ROBOKASSA_INVOICE_CREATE_URL=https://services.robokassa.ru/InvoiceServiceWebApi/api/CreateInvoice
ROBOKASSA_INVOICE_STATUS_URL=https://services.robokassa.ru/InvoiceServiceWebApi/api/GetInvoiceInformationList
ROBOKASSA_INVOICE_DEACTIVATE_URL=https://services.robokassa.ru/InvoiceServiceWebApi/api/DeactivateInvoice
ROBOKASSA_INVOICE_TIMEOUT_MS=10000   # default=10000

# PostHog analytics (client-side + web/worker error tracking, optional)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Resume extraction through protected Tika proxy (required for resume file uploads after Tika rollout)
TIKA_BASE_URL=https://your-tika-proxy.example.com
TIKA_AUTH_TOKEN=...
TIKA_TIMEOUT_MS=20000
```

### Настройка webhook (один раз на окружение)

Для production рекомендуется регистрировать webhook на Telegram relay:

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://tg.hiiire.com/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"]}"
```

### Cron

Production cron-задачи выполняются системным cron на self-hosted Supabase VPS.
Конфигурация и скрипт хранятся в
[`supabase/selfhost/`](./supabase/selfhost/). Запуск — ежедневно в `09:00 UTC`
(`12:00` по Москве), с `flock`, тремя попытками и таймаутом до 5 минут на
endpoint.

Ожидаемые jobs:

- `api/cron/billing-renewals`
  - schedule: `0 9 * * *` в GMT, то есть ежедневный запуск в 12:00 по Москве
  - method: `POST`
  - URL: `https://hiiire.com/api/cron/billing-renewals`
  - header: `x-cron-secret`, значение должно совпадать с prod `CRON_SECRET`
  - назначение: recurring renewal, retry/grace logic, отключение `auto_renew` после grace, активация оплаченных будущих смен тарифа, cleanup expired immediate checkouts
- `api/cron/plan-expiry`
  - schedule: `0 9 * * *` в GMT, то есть ежедневный запуск в 12:00 по Москве
  - method: `POST`
  - URL: `https://hiiire.com/api/cron/plan-expiry`
  - header: `x-cron-secret`, значение должно совпадать с prod `CRON_SECRET`
  - назначение: уведомления за 7 дней, за 1 день и после истечения тарифа

`plan-expiry` работает по `company_plans.expires_at`:

- если дата истечения через 7 дней, отправляет `expires_7d`;
- если дата истечения через 1 день, отправляет `expires_1d`;
- если тариф уже истек, отправляет `expired` каждый день, пока тариф не продлен/не оплачен и `expires_at` остается в прошлом;
- Telegram/email настройки пользователей учитываются внутри каналов уведомлений: если канал отключен или не подключен, по нему отправки не будет.

Логи пишутся в `/var/log/hiiire-production-cron.log`. Секрет хранится отдельно
в `/opt/hiiire-cron/secret.env` с правами `0600`, а не в crontab.

Подробности деплоя и cron — в [`DEPLOYMENT.md`](./DEPLOYMENT.md).

Подсказка: можно сгенерировать секрет в PowerShell:

```powershell
# 32 bytes -> base64
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## 🚀 Технологический стек

### Фронтенд
- **Next.js 16.2.6** (App Router)
- **React 19.1.0**
- **TypeScript 5.9.3**
- **Tailwind CSS 4.1.14**
- **shadcn/ui** - UI компоненты
- **Framer Motion** - Анимации
- **React Hook Form** + **Zod** - Формы и валидация
- **Sonner** - Уведомления
- **PostHog JS / Node** - продуктовая аналитика и server error tracking

### Бэкенд (Production)
- **Supabase** - База данных, Authentication, Storage
- **HH.ru API** - Интеграция с HeadHunter
- **Gemini** - AI анализ резюме (async jobs + worker)
- **Resume file extraction** - извлечение текста из файлов резюме (PDF/DOC/DOCX/TXT) через защищённый Tika proxy; лимиты формато-независимые: файл до 5MB, извлечённый текст до 50 000 символов / 8 000 слов, минимум 20 символов; оригинальный файл при необходимости сохраняется в Supabase Storage, извлечённый текст пишется в `candidates.resume_text`

### Деплой
- **Timeweb Cloud App** - RU-friendly хостинг (3 приложения после Tika rollout: web + worker + hiiire-tika)

---

## 🔒 Поддерживаемые версии (важно для безопасности)

Чтобы не ловить критические уязвимости (как в `next`) и воспроизводимо собирать проект, **фиксируем базовые версии**.

### Runtime / toolchain
- **Node.js**: `>= 20.9.0` (проверено на `22.17.0`)
- **npm**: `>= 10` (проверено на `10.9.2`)

### Frameworks (core)
- **Next.js**: `16.2.6` (держать в актуальном patch/minor, особенно по security)
- **React / React DOM**: `19.1.0`
- **TypeScript**: `5.9.3`
- **Tailwind CSS**: `4.1.14`

### Key SDKs (top-level deps)
- **Supabase JS**: `@supabase/supabase-js@2.90.1` + `@supabase/ssr@0.8.0`
- **OpenAI SDK**: `openai@6.16.0`
- **Gemini SDK**: `@google/genai@1.37.0`

### Правила апдейта (рекомендуется)
- **Next.js**: обновлять вместе с `eslint-config-next` **на ту же версию**.
- **Линтинг**: начиная с Next 16, `next build` **не запускает** линтер автоматически — используем `npm run lint` отдельно.
- **Security**: не использовать `npm audit fix --force` на production-ветке без осознанного major-upgrade; вместо этого:
  - обновлять зависимости до ближайших безопасных версий
  - при необходимости временно фиксить транзитивные пакеты через `package.json -> overrides`

## 🧭 Архитектура (коротко)

- **`hiiire-web` (Next.js)**: UI + `app/api/*` (создание вакансий/кандидатов, постановка AI job, polling статуса).
- **`hiiire-worker` (Node.js)**: фоновая обработка очереди `jobs_ai` (Gemini/OpenAI → запись результата), **параллельно до `WORKER_CONCURRENCY` задач** (по умолчанию `3`, диапазон `1..32` на инстанс).
- **`hiiire-tika` (Docker Compose)**: защищённый Node/Fastify proxy + `apache/tika` для извлечения plain text из PDF/DOC/DOCX/TXT резюме. Web вызывает этот сервис по `TIKA_BASE_URL`; Tika не имеет доступа к БД, Supabase Storage или LLM-ключам.
- **Связь web ↔ worker**: **только через Supabase (Postgres)** — прямого HTTP между приложениями не требуется.
- **Связь web ↔ Tika**: HTTPS-запрос от web к защищённому Tika proxy с `TIKA_AUTH_TOKEN`; сам контейнер `apache/tika` наружу не публикуется.
- **Auth Tika proxy**: проверка токена привязана к Fastify route `onRequest` для `PUT /tika`, до парсинга body и upstream Tika; `PUT /tika?probe=1` без auth тоже возвращает `401`.
- **Content types Tika proxy**: proxy принимает только resume-типы `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`; `application/octet-stream` разрешён только вместе с валидным `x-hiiire-file-kind` (`pdf|doc|docx|txt`).
- **Лимиты загрузки резюме после Tika**: UI и API не используют лимит по количеству страниц PDF; вместо него действуют единые ограничения для PDF/DOC/DOCX/TXT: файл до 5MB, извлечённый текст до 50 000 символов / 8 000 слов, минимум 20 символов и timeouts web/proxy.
- **AI pipeline**:
  - UI создаёт кандидата и (если нужно) ставит задачу в `public.jobs_ai`
  - worker атомарно “claim’ит” job, вызывает AI, пишет `public.ai_analyses`, обновляет `public.candidates.match_percentage`, помечает job как `done` или `failed`
  - в prompt отдельно передаются `candidateDesiredSalary` и `vacancySalary`; если зарплаты нельзя корректно сравнить (нет верхней границы вакансии, разные валюты, несопоставимые период/налоги и т.п.), зарплата не снижает score
  - если условия сопоставимы и ожидания кандидата выше верхней границы вакансии, AI должен снижать score и явно отмечать расхождение, а worker дополнительно детерминированно снижает persisted `match_percentage`
  - UI показывает `queued/processing/failed`, а при `done` подтягивает финальные значения из `candidates/ai_analyses`
- **Устойчивость AI-анализа (важно для edge-cases)**:
  - если резюме слишком короткое/мусорное (например, `аааааа...`) и LLM вернул пустые массивы в `strengths/weaknesses/recommendations`, воркер **не падает** и не “ломает” очередь
  - вместо этого воркер нормализует **только ответ LLM** (не входные данные): подставляет безопасные фразы вроде “Недостаточно данных…”, приводит `reasons` к ровно 3 пунктам и гарантирует непустые массивы
  - это сделано на этапе парсинга ответа провайдера (`worker/src/ai-analysis.ts`, `AiAnalysisSchemaParsed`)
- **Защита от дублей job (важно для UX)**:
  - постановка AI job **идемпотентна**: повторные нажатия **«Запустить AI анализ» / «Повторить»** и повторные запросы **не создают несколько активных задач** по одному кандидату
  - если job уже в `queued/processing`, API вернёт существующий `jobId`, а UI безопасно “залочит” повторный клик
- **Защита от дублей кандидатов при добавлении**:
  - форма добавления кандидата использует client-side single-flight на время проверки баланса, создания кандидатов и постановки AI job; фоновое ожидание результатов AI-анализа не блокирует следующую пачку после закрытия окна
  - серверное создание кандидата в `POST /api/candidates` тоже **идемпотентно**: повтор с тем же ключом не создаёт второго кандидата и не списывает кредиты повторно
  - для этого в Supabase используется таблица `public.api_idempotency_keys` и SQL-функция `public.create_candidate_with_idempotency(...)`
- **Credits**: при постановке job происходит **резерв** (available \(=\) `balance - reserved`), финальное списание — **только при успешной финализации** (см. `docs/DATABASE_SCHEMA.md`, `supabase/sql/ai_jobs.sql`).

---

## 🏁 Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка окружения

Скопируйте `.env.example` в `.env.local`:

```bash
cp .env.example .env.local
```

Для локальной разработки нужен настроенный Supabase-проект и переменные из `.env.example`.

Реквизиты оператора сервиса для юридических страниц (`/terms`, `/privacy`, `/refund`, `/contact`, `/about`) не хранятся в репозитории и задаются через `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_INN`, `LEGAL_OPERATOR_OGRN` (и необязательный `LEGAL_OPERATOR_REGISTRATION_DATE`). Локально их можно не задавать: страницы откроются без блока реквизитов. В production они обязательны — см. [DEPLOYMENT.md](./DEPLOYMENT.md#реквизиты-оператора-юридические-страницы).

Для режима Supabase + real AI (async):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- server-only: `SUPABASE_SERVICE_ROLE_KEY`
- server-only (рекомендуется для production): `AUTH_VERIFICATION_CONTEXT_SECRET`  
  Используется для подписи `HttpOnly` cookie в flow подтверждения email (`/verify-email`). Если не задан, используется fallback на `SUPABASE_SERVICE_ROLE_KEY`.
- HH.ru (server-only, user-level OAuth работодателя):
  - `HH_ru_client_id`
  - `HH_ru_client_secret`
  - (рекомендуется) `HH_RU_REDIRECT_URI` — callback URL вида `https://<host>/api/integrations/hh/callback` (если не задан, вычисляется из входящего request)
  - (опционально) `HH_RU_HOST` — `host` для запросов к `api.hh.ru` (по умолчанию `hh.ru`, можно указать другой сайт HH-группы для dev/другого контура)
  - (опционально) `HH_USER_AGENT` — заголовок `HH-User-Agent` для запросов к HH API
  - рекомендация: держать два одобренных приложения в HH (prod/dev) с одинаковыми правами и разными `client_id/client_secret`
  - если пользователь авторизовался в HH.ru как соискатель, callback возвращает его в настройки интеграций с понятным сообщением, что подключение доступно только для аккаунтов работодателя

Для PostHog analytics:
- `NEXT_PUBLIC_POSTHOG_KEY` — project API key
- `NEXT_PUBLIC_POSTHOG_HOST` — host PostHog ingestion endpoint, по умолчанию `https://us.i.posthog.com`
- если `NEXT_PUBLIC_POSTHOG_KEY` не задан, браузерная аналитика и server error tracking не инициализируются
- после входа `posthog.identify(user.id, { email, name, role, company_id, plan, billing_status })` связывает анонимные события с пользователем и задаёт person display properties; `posthog.group("company", company_id, { name, plan, billing_status })` связывает события с компанией и задаёт display name группы; при выходе вызывается `posthog.reset()`
- server-side ошибки Next.js отправляются через `instrumentation.ts`; request headers не передаются в PostHog
- worker отправляет в PostHog структурированные события `worker_started`, `ai_job_claimed`, `ai_job_completed`, `ai_job_failed`, `ai_job_requeued`, `ai_job_terminal_failed`, `hh_sync_failed`, а также product-события `ai_analysis_completed`, `ai_analysis_failed`, `company_activated`; тексты резюме, описания вакансий, промпты, raw-ответы AI, HH tokens и raw HH payloads не отправляются. `hh_sync_failed` содержит только безопасную диагностику: тип ошибки, нормализованный HH path, ключи query и pagination/status без provider ids.

### PostHog business events

hiiire отправляет product и revenue events из server mutation points. Supabase остаётся source of truth для точной выручки, credits, подписок и investor reporting; PostHog используется для funnels, retention, paths и company-level product analytics.

Core events:
- Activation: `signup_completed`, `company_group_identified`, `company_activated`
- Product: `vacancy_created`, `vacancy_status_changed`, `candidate_added`, `candidate_imported_hh`, `resume_extraction_completed`, `resume_extraction_failed`, `ai_analysis_started`, `ai_analysis_completed`, `ai_analysis_failed`
- HH: `hh_connected`, `hh_sync_started`, `hh_sync_completed`
- Revenue: `checkout_started`, `payment_completed`, `payment_failed`, `credit_topup_paid`, `subscription_renewed`, `downgrade_scheduled`, `credits_granted`
- Enterprise: `enterprise_lead_created`, `enterprise_lead_reopened`, `enterprise_request_created`, `enterprise_request_status_changed`, `enterprise_agreement_activated`

Events include `company_id`, `user_id` where available, role, plan/billing properties where available, and PostHog company groups (`company`). Resume extraction events may also include a safe `request_id` for web/proxy correlation. Events must not include resume text, lead messages, phone numbers, provider payloads, tokens, prompts, raw AI output, Robokassa signatures, or HH raw payloads.

### Marketing attribution

hiiire сохраняет first-touch/last-touch UTM-атрибуцию в Supabase и показывает platform admin воронку `/admin/marketing`: визиты, регистрации, компании, оплаты и выручку по `utm_source / utm_medium / utm_campaign`. Оплаты и выручка включают подписки и разовые пополнения credits. В этой же админке есть постраничный список конкретных регистраций: имя/email пользователя, компания, дата регистрации и первый источник.

- В `/admin/marketing` есть компактный конструктор ссылок для рекламы и рассылок: по умолчанию он ведёт на `https://hiiire.com/`, поддерживает пресеты лендинга и заявки, стандартные UTM-поля, дополнительные `key=value` параметры, удаление параметров, copy-to-clipboard и раскрывающуюся справку по смыслу каждого поля.
- Клиентский сбор UTM работает best-effort через localStorage/sessionStorage и endpoint `POST /api/marketing/attribution/visit`; продуктовые `/dashboard/*`, `/admin/*`, `/api/*`, auth callback маршруты и root-level auth страницы `/login`, `/forgot-password`, `/reset-password`, `/verify-email` не создают маркетинговые визиты.
- UTM-сбор не зависит от включённого PostHog: если `NEXT_PUBLIC_POSTHOG_KEY` не задан, Supabase/admin attribution всё равно работает.
- Если браузер блокирует localStorage/sessionStorage, attribution тихо пропускается или отправляется без локального сохранения; signup от этого не падает.
- Первый рекламный источник фиксируется как first non-direct touch: если пользователь сначала пришёл напрямую, а позже по UTM, в signup/revenue attribution попадёт первый UTM-источник. Last-touch обновляется при каждом новом UTM/click id.
- Регистрация передаёт сохранённую attribution в `/api/auth/signup`; signup не должен падать, если attribution недоступна или не сохранилась.
- До регистрации визит считается по `visitor_id`; конкретный человек появляется в отчёте только после signup, когда attribution связывается с `user_id` и `company_id`.
- Визиты для периода 7/30/90 дней считаются по server receipt time в `marketing_visit_events.seen_at`, а не по клиентским часам и не по lifetime `visit_count`; отчёт агрегируется RPC `get_marketing_admin_report`, чтобы не упираться в лимиты PostgREST row fetch.
- Оплаты компаний без `marketing_conversions` попадают в отдельный источник `unattributed`, а не смешиваются с настоящим `direct`.
- RPC ограничивает выдачу source-групп, по умолчанию top 200; оставшиеся группы сворачиваются в `other / mixed / other`.
- Signup upsert'ит visitor/conversion без второго visit event; если публичный capture уже прошёл, счётчик визитов не раздувается.
- PostHog остаётся идентифицированным по `user_id` и `company_id`, но получает только UTM-поля (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`). Click IDs (`gclid`, `fbclid`, `msclkid`) хранятся в Supabase для внутренней attribution/admin, но вырезаются из всех browser capture payloads PostHog: event props, `$set`, `$set_once`, вложенных объектов и URL-полей вроде `$current_url`, включая DB-ключи `first_*` / `last_*`.
- Revenue events `checkout_started`, `payment_completed`, `payment_failed`, `subscription_renewed`, `credit_topup_paid` и paid top-up `credits_granted` дополнительно получают first-touch UTM-поля для PostHog funnels. Если subscription checkout переиспользует живой pending payment, `checkout_started` всё равно отправляется с `reused=true`.
- Ручная выдача credits из platform admin остаётся support/admin событием: `credits_granted` помечается `source="manual_admin"` и не получает marketing attribution.
- Для новых окружений примените по порядку [`supabase/sql/marketing_attribution_v1.sql`](./supabase/sql/marketing_attribution_v1.sql), [`supabase/sql/marketing_attribution_hardening_v1.sql`](./supabase/sql/marketing_attribution_hardening_v1.sql), [`supabase/sql/marketing_attribution_admin_report_v2.sql`](./supabase/sql/marketing_attribution_admin_report_v2.sql), [`supabase/sql/marketing_attribution_admin_report_v3.sql`](./supabase/sql/marketing_attribution_admin_report_v3.sql), [`supabase/sql/marketing_attribution_admin_report_v4.sql`](./supabase/sql/marketing_attribution_admin_report_v4.sql), [`supabase/sql/marketing_attribution_admin_report_v5.sql`](./supabase/sql/marketing_attribution_admin_report_v5.sql), [`supabase/sql/marketing_attribution_admin_report_v6.sql`](./supabase/sql/marketing_attribution_admin_report_v6.sql). Таблицы `marketing_visitors`, `marketing_visit_events` и `marketing_conversions` server-only: RLS включён, доступ для `anon`/`authenticated` отозван.

### Ротация HH OAuth-токена

- После подключения HH.ru в `integrations_accounts` сохраняются `access_token`, `refresh_token` и `token_expires_at`.
- И ручные запросы из Next.js API, и фоновый HH sync в worker используют одну и ту же серверную схему: токен обновляется до запроса, если локально уже подошёл к истечению.
- Если HH вернул auth-ошибку именно в формате `token_expired`, сервер один раз обновляет токен и повторяет тот же запрос ещё раз.
- После успешного refresh новые `access_token` / `refresh_token` и новое `token_expires_at` сразу сохраняются в БД, чтобы следующий запрос уже работал с актуальной парой токенов.
- Если refresh пришёлся одновременно из двух процессов и один из них получил ответ вроде `token has already been refreshed`, система сначала перечитывает свежие токены из БД и продолжает работу, если другая сторона уже успела их сохранить.
- Интеграция отключается только в случаях, когда HH явно сообщает, что доступ уже не восстановить автоматически: токен отозван, refresh-токен больше невалиден, аккаунт заблокирован, логин требует повторного подтверждения и похожие сценарии.
- На фронте токены не обрабатываются: логика refresh и повторной попытки находится только на сервере.
- AI provider (выберите один):
  - **OpenAI (GPT‑5.2)**: `AI_PROVIDER=openai`, `OPENAI_API_KEY` (+ опц. `OPENAI_MODEL=gpt-5.2`)
  - **Gemini**: `AI_PROVIDER=gemini`, `GEMINI_API_KEY` (+ опц. `GEMINI_MODEL=gemini-2.5-flash`)
  - **DeepSeek (V4)**: `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY` (+ опц. `DEEPSEEK_MODEL=deepseek-v4-flash` или `deepseek-v4-pro`)
  - **Auto-fallback (рекомендуется)**: можно держать `AI_PROVIDER=openai`, но также задать `DEEPSEEK_API_KEY` — тогда воркер **автоматически переключится на DeepSeek при ошибке OpenAI** (без дополнительных флагов).
    - DeepSeek model по умолчанию: `DEEPSEEK_MODEL=deepseek-v4-flash` (если переменная не задана).
- DeepSeek parser для предзаполнения карточки кандидата работает в web/API route, а не в worker. По умолчанию используется `DEEPSEEK_CANDIDATE_PARSER_MODEL=deepseek-v4-flash`; при ошибке parser не блокирует создание кандидата и возвращает regex fallback.
- Для пустого self-hosted Supabase без доступного дампа используйте единый recovery bootstrap: [`supabase/bootstrap/README.md`](./supabase/bootstrap/README.md). Он воспроизводимо собирает базовую схему, все репозиторные SQL-изменения, RLS/RPC и Storage policies; пользовательские данные, Auth-настройки и файлы он не восстанавливает.
- очередь AI jobs (`jobs_ai`) развёрнута в production self-hosted Supabase
  recovery bootstrap вместе с актуальными queue/RPC-миграциями.
  - если вы создаёте новый Supabase проект/окружение — примените SQL: [`supabase/sql/ai_jobs.sql`](./supabase/sql/ai_jobs.sql)
  - для учёта usage parser-запросов примените SQL: [`supabase/sql/ai_usage_events.sql`](./supabase/sql/ai_usage_events.sql). Таблица server-only: RLS deny-all, без prompt/resume/raw output/contact/name/position/provider payload columns.
  - в `ai_jobs.sql` уже включена защита от дублей при “Retry” (идемпотентный enqueue: максимум 1 активная job на кандидата)
  - для идемпотентного создания кандидатов также примените SQL: [`supabase/sql/candidate_create_idempotency_v1.sql`](./supabase/sql/candidate_create_idempotency_v1.sql)
  - для маркетинговой атрибуции и отчёта `/admin/marketing` примените SQL по порядку: [`supabase/sql/marketing_attribution_v1.sql`](./supabase/sql/marketing_attribution_v1.sql), [`supabase/sql/marketing_attribution_hardening_v1.sql`](./supabase/sql/marketing_attribution_hardening_v1.sql), [`supabase/sql/marketing_attribution_admin_report_v2.sql`](./supabase/sql/marketing_attribution_admin_report_v2.sql), [`supabase/sql/marketing_attribution_admin_report_v3.sql`](./supabase/sql/marketing_attribution_admin_report_v3.sql), [`supabase/sql/marketing_attribution_admin_report_v4.sql`](./supabase/sql/marketing_attribution_admin_report_v4.sql), [`supabase/sql/marketing_attribution_admin_report_v5.sql`](./supabase/sql/marketing_attribution_admin_report_v5.sql), [`supabase/sql/marketing_attribution_admin_report_v6.sql`](./supabase/sql/marketing_attribution_admin_report_v6.sql)
  - **важно**: чтобы добавить кандидатов, нужна хотя бы одна вакансия (статус **draft** или **active**). Создайте её в `/dashboard/vacancies` кнопкой **«Создать вакансию»**.
- Signup/trial flow для Supabase окружения:
  - если это новый Supabase проект — примените SQL миграции в таком порядке:
    1. [`supabase/sql/trial_and_onboarding.sql`](./supabase/sql/trial_and_onboarding.sql)
    2. [`supabase/sql/signup_trial_provisioning.sql`](./supabase/sql/signup_trial_provisioning.sql)
    3. [`supabase/sql/signup_trial_hardening.sql`](./supabase/sql/signup_trial_hardening.sql)
    4. [`supabase/sql/billing_robokassa_v1.sql`](./supabase/sql/billing_robokassa_v1.sql)
    5. [`supabase/sql/billing_scheduled_downgrade_v1.sql`](./supabase/sql/billing_scheduled_downgrade_v1.sql)
    6. [`supabase/sql/billing_paid_scheduled_downgrade_v1.sql`](./supabase/sql/billing_paid_scheduled_downgrade_v1.sql)
    7. [`supabase/sql/billing_paid_scheduled_downgrade_hardening_v1.sql`](./supabase/sql/billing_paid_scheduled_downgrade_hardening_v1.sql)
    8. [`supabase/sql/billing_paid_scheduled_downgrade_production_hardening_v1.sql`](./supabase/sql/billing_paid_scheduled_downgrade_production_hardening_v1.sql)
    9. [`supabase/sql/billing_paid_scheduled_downgrade_review_fixes_v1.sql`](./supabase/sql/billing_paid_scheduled_downgrade_review_fixes_v1.sql)
    10. [`supabase/sql/billing_paid_scheduled_downgrade_enterprise_supersede_v1.sql`](./supabase/sql/billing_paid_scheduled_downgrade_enterprise_supersede_v1.sql)
    11. [`supabase/sql/billing_checkout_pending_immediate_idempotency_v1.sql`](./supabase/sql/billing_checkout_pending_immediate_idempotency_v1.sql)
    12. [`supabase/sql/billing_immediate_checkout_lifecycle_v1.sql`](./supabase/sql/billing_immediate_checkout_lifecycle_v1.sql)
    13. [`supabase/sql/billing_expired_immediate_checkout_finalize_review_v1.sql`](./supabase/sql/billing_expired_immediate_checkout_finalize_review_v1.sql)
    14. [`supabase/sql/billing_recurring_renewal_idempotency_and_mandate_v1.sql`](./supabase/sql/billing_recurring_renewal_idempotency_and_mandate_v1.sql)
    15. [`supabase/sql/billing_recurring_mandate_legacy_backfill_v1.sql`](./supabase/sql/billing_recurring_mandate_legacy_backfill_v1.sql)
    16. [`supabase/sql/billing_recurring_root_mandate_invoice_v1.sql`](./supabase/sql/billing_recurring_root_mandate_invoice_v1.sql)
    17. [`supabase/sql/billing_recurring_root_mandate_invoice_overload_cleanup_v1.sql`](./supabase/sql/billing_recurring_root_mandate_invoice_overload_cleanup_v1.sql)
    18. [`supabase/sql/billing_recurring_root_mandate_enterprise_clear_v1.sql`](./supabase/sql/billing_recurring_root_mandate_enterprise_clear_v1.sql)
    19. [`supabase/sql/billing_plan_credit_limits_v1.sql`](./supabase/sql/billing_plan_credit_limits_v1.sql)
    20. [`supabase/sql/handle_new_user_platform_admin_company_member_v1.sql`](./supabase/sql/handle_new_user_platform_admin_company_member_v1.sql)
    21. [`supabase/sql/signup_trial_duration_7_days_v1.sql`](./supabase/sql/signup_trial_duration_7_days_v1.sql)
    22. [`supabase/sql/signup_email_state_v1.sql`](./supabase/sql/signup_email_state_v1.sql)
    23. [`supabase/sql/verification_email_resend_limit_v1.sql`](./supabase/sql/verification_email_resend_limit_v1.sql)
    24. [`supabase/sql/enterprise_billing_flow_v1.sql`](./supabase/sql/enterprise_billing_flow_v1.sql)
    25. [`supabase/sql/enterprise_manual_invoice_inv_id_v1.sql`](./supabase/sql/enterprise_manual_invoice_inv_id_v1.sql)
    26. [`supabase/sql/enterprise_agreement_activation_rpc_v1.sql`](./supabase/sql/enterprise_agreement_activation_rpc_v1.sql)
    27. [`supabase/sql/enterprise_agreement_amendments_and_request_closure_v1.sql`](./supabase/sql/enterprise_agreement_amendments_and_request_closure_v1.sql)
    28. [`supabase/sql/enterprise_exit_request_and_terminal_requests_v1.sql`](./supabase/sql/enterprise_exit_request_and_terminal_requests_v1.sql)
    29. [`supabase/sql/enterprise_exit_company_plan_required_v1.sql`](./supabase/sql/enterprise_exit_company_plan_required_v1.sql)
    30. [`supabase/sql/enterprise_agreement_source_request_unique_v1.sql`](./supabase/sql/enterprise_agreement_source_request_unique_v1.sql)
    31. [`supabase/sql/enterprise_activation_source_request_required_v1.sql`](./supabase/sql/enterprise_activation_source_request_required_v1.sql)
    32. [`supabase/sql/enterprise_request_agreement_lifecycle_guard_v1.sql`](./supabase/sql/enterprise_request_agreement_lifecycle_guard_v1.sql)
    33. [`supabase/sql/enterprise_activation_paid_invoice_required_v1.sql`](./supabase/sql/enterprise_activation_paid_invoice_required_v1.sql)
    34. [`supabase/sql/enterprise_pending_activation_and_restore_rpc_v1.sql`](./supabase/sql/enterprise_pending_activation_and_restore_rpc_v1.sql)
    35. [`supabase/sql/enterprise_restore_blocks_provider_review_invoice_v1.sql`](./supabase/sql/enterprise_restore_blocks_provider_review_invoice_v1.sql)
    36. [`supabase/sql/enterprise_restore_blocks_provider_url_invoice_v1.sql`](./supabase/sql/enterprise_restore_blocks_provider_url_invoice_v1.sql)
    37. [`supabase/sql/enterprise_restore_provider_url_only_guard_v1.sql`](./supabase/sql/enterprise_restore_provider_url_only_guard_v1.sql)
    38. [`supabase/sql/enterprise_current_invoice_cycle_rpc_v1.sql`](./supabase/sql/enterprise_current_invoice_cycle_rpc_v1.sql)
    39. [`supabase/sql/enterprise_restore_blocks_paid_review_invoice_v1.sql`](./supabase/sql/enterprise_restore_blocks_paid_review_invoice_v1.sql)
    40. [`supabase/sql/enterprise_restore_current_cycle_guard_v1.sql`](./supabase/sql/enterprise_restore_current_cycle_guard_v1.sql)
    41. [`supabase/sql/enterprise_request_flow_drawer_guards_v1.sql`](./supabase/sql/enterprise_request_flow_drawer_guards_v1.sql)
    42. [`supabase/sql/enterprise_exit_current_company_plan_schema_v1.sql`](./supabase/sql/enterprise_exit_current_company_plan_schema_v1.sql)
  - Для billing-релиза порядок важен: сначала применить все billing SQL-миграции в Supabase, затем выкатывать app-код. Новый app-код зависит от Enterprise amendment/request RPC, `enterprise_agreements.replaces_agreement_id`, `enterprise_agreements.ended_by_request_id` и защиты terminal billing requests.
  - `enterprise_billing_flow_v1` применена в hiiire Supabase project через Supabase MCP 2026-05-03; backfill создал active Enterprise agreements для существующих Enterprise-компаний.
  - `enterprise_agreement_amendments_and_request_closure_v1` применена в hiiire Supabase project через Supabase MCP 2026-05-13; миграция добавила audit trail для Enterprise amendments и request-aware завершение Enterprise agreement.
  - `enterprise_exit_request_and_terminal_requests_v1` применена в hiiire Supabase project через Supabase MCP 2026-05-13; миграция добавила `enterprise_agreements.ended_by_request_id`, требует approved `enterprise_exit` request для выхода из Enterprise и защищает terminal billing request statuses от обычного переоткрытия.
  - `enterprise_exit_company_plan_required_v1` применена в hiiire Supabase project через Supabase MCP 2026-05-14; миграция запрещает завершать active Enterprise agreement, если у компании нет `company_plans.current_plan='enterprise'`.
  - `enterprise_agreement_source_request_unique_v1` применена в hiiire Supabase project через Supabase MCP 2026-05-27; миграция добавила DB-level idempotency guard для одной draft/pending/active agreement на source request.
  - `enterprise_activation_source_request_required_v1` применена в hiiire Supabase project через Supabase MCP 2026-05-27; миграция запрещает активировать legacy draft/pending Enterprise agreement без связанной approved billing request.
  - `enterprise_request_agreement_lifecycle_guard_v1` защищает гонку между закрытием approved billing request и созданием draft/pending Enterprise agreement из этой заявки.
  - `enterprise_activation_paid_invoice_required_v1` запрещает активировать Enterprise agreement до оплаты связанного manual invoice.
  - `enterprise_pending_activation_and_restore_rpc_v1` сужает activation до `pending_payment` и добавляет атомарный restore в `draft` для stuck agreement без `issued`/`paid` invoice.
  - `enterprise_restore_blocks_provider_review_invoice_v1` запрещает restore в `draft`, если `requires_review` invoice уже содержит provider invoice id или payable URL.
  - `enterprise_restore_blocks_provider_url_invoice_v1` запрещает restore в `draft`, если любой linked manual invoice ещё содержит provider payable URL.
  - `enterprise_restore_provider_url_only_guard_v1` уточняет restore guard: заранее зарезервированный Robokassa `InvId` сам по себе не считается payable invoice без provider URL.
  - `enterprise_current_invoice_cycle_rpc_v1` добавляет атомарный DB RPC для создания draft manual invoice и перевода agreement в `pending_payment`, а activation разрешает только по newest linked manual invoice со статусом `paid`.
  - `enterprise_restore_blocks_paid_review_invoice_v1` запрещает restore, если по linked invoice уже пришёл paid webhook review без provider URL.
  - `enterprise_restore_current_cycle_guard_v1` уточняет restore: provider URL блокирует любой linked invoice, а `issued`/`paid`/paid-review блокируют только newest invoice cycle, чтобы поздний callback на старый счёт не застревал следующий recovery.
  - `enterprise_request_flow_drawer_guards_v1` добавляет атомарное создание Enterprise conditions из approved request с `updated_at` snapshot и обновляет Enterprise exit RPC, чтобы stale approved request нельзя было применить.
  - `enterprise_exit_current_company_plan_schema_v1` применена в hiiire Supabase project через Supabase MCP 2026-05-31; миграция переустанавливает Enterprise exit RPC на текущую схему `company_plans`, чтобы завершение Enterprise через админку не обращалось к legacy billing-полям.
  - эти миграции добавляют server-side provisioning через `handle_new_user`, анти-абьюз “один trial на email”, audit signup provisioning и отдельную ветку для platform admin (создание пользователя в существующей компании без создания новой компании/trial).
  - hardening signup duplicate-email flow:
    - регистрация переведена на server-side endpoint `POST /api/auth/signup`
    - endpoint различает новый email, существующий подтверждённый email и существующий неподтверждённый email без повторного создания пользователя
    - для снижения риска массового перебора включён базовый rate limit: до **36** попыток за **15 минут** на IP и до **9** попыток за **15 минут** на связку `IP + email`
    - ответы signup дополнительно выравниваются по минимальному времени ответа, чтобы уменьшить простые timing-based проверки
    - email в `/signup` и `/request-access` проверяется по общему правилу на клиенте и сервере: адрес должен содержать `@` и домен с точкой; для частого кейса `name@company` пользователю показывается явная подсказка
- Billing/checkout env (server-only):
  - обязательные: `ROBOKASSA_MERCHANT_LOGIN` (или legacy `ROBOKASSA_LOGIN`), `ROBOKASSA_PASSWORD1`, `ROBOKASSA_PASSWORD2`, `CRON_SECRET`
  - опциональные: `ROBOKASSA_IS_TEST` (по умолчанию `true`), `ROBOKASSA_HASH_ALGORITHM` (по умолчанию `md5`), `ROBOKASSA_PAYMENT_URL`, `ROBOKASSA_RECURRING_URL`

### 3. Запуск dev сервера

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

### 4. Запуск worker (для async AI jobs)

Worker нужен только для режима “real AI”.

Параметры воркера (опционально):
- `WORKER_CONCURRENCY` — сколько job’ов обрабатывать параллельно (по умолчанию `3`).
- `WORKER_POLL_MS` — интервал опроса очереди (по умолчанию `1000`).
- idle backoff очереди `jobs_ai`: если очередь пуста и у воркера нет активных job, интервал ожидания автоматически растёт до `30000` и сбрасывается после первого успешного claim.
- `WORKER_ID` — идентификатор воркера (по умолчанию `hostname:pid`).
- `WORKER_HEARTBEAT_MS` — как часто обновлять lease (`jobs_ai.locked_at`) для активной job (по умолчанию `30000`).  
  Нужен, чтобы job не “застревала” навечно в `processing` при сбоях и чтобы долгие анализы не перехватывались другим воркером.
- `WORKER_HEARTBEAT_GLOBAL_MS` — как часто воркер пишет heartbeat в `public.worker_heartbeats` (по умолчанию `30000`).  
  Нужен для метрик в `/admin/metrics` (видеть живые воркеры даже когда очередь пуста).
- `WORKER_VERSION` — произвольная строка версии (например, git sha) для отображения в `/admin/metrics` (опционально).
- `WORKER_LOG_EGRESS_IP` — если `true/1/yes`, логирует egress IP воркера (диагностика/whitelist у AI провайдеров).
- HH.ru auto-sync (опционально, hybrid-режим):
  - `WORKER_ENABLE_HH_SYNC=true` — включить фоновую синхронизацию HH.ru (вакансии + кандидаты)
  - `WORKER_HH_SYNC_MIN_INTERVAL_MINUTES` — минимальный интервал между синками на одного пользователя (по умолчанию `10`)
  - `WORKER_HH_SYNC_LOOP_MS` — частота цикла синка (по умолчанию `60000`)
  - `WORKER_HH_SYNC_LIMIT` — лимит интеграций на один проход (по умолчанию `10`)

Как работает HH auto-sync воркера:
- Запускается только при `WORKER_ENABLE_HH_SYNC=true`.
- На каждом цикле (`WORKER_HH_SYNC_LOOP_MS`) воркер не читает пачку интеграций напрямую, а атомарно claim’ит по одной `public.integrations_accounts` через RPC `public.claim_due_hh_integration(...)`.
- Due-интеграцией считается активная HH-интеграция, где `last_synced_at` пустой или старше `WORKER_HH_SYNC_MIN_INTERVAL_MINUTES`, и при этом нет активного sync lease (`sync_lock_expires_at`).
- За один проход обрабатывает не более `WORKER_HH_SYNC_LIMIT` интеграций.
- По вакансиям: создаёт новые и обновляет существующие HH-вакансии по `hhru_vacancy_id`; у существующих обновляет контент вакансии (`title`, `description`, `location`), локальный статус вакансии (`draft|active|paused|closed`) не перетирает.
- По кандидатам: сначала загружает локальных HH-кандидатов и их контакты, затем считает fingerprint входящего HH payload и пишет только новые/изменившиеся записи.
- Ожидаемая зарплата из HH resume salary сохраняется в `candidates.desired_salary_*`: `RUR` нормализуется в `RUB`, поддерживаются `RUB/USD/EUR/KZT`; `salary: null` очищает видимую зарплату, а отсутствующий или некорректный salary не перетирает уже сохранённое значение.
- Для кандидатов больше нет steady-state схемы `insert -> duplicate -> select -> update`: синк разделяет `new -> batch insert`, `changed -> batch update`, `unchanged -> skip`.
- `candidate_contacts` заменяются только для тех кандидатов, у которых реально изменился нормализованный contact payload.
- Для пропуска неизменившихся записей используются поля `candidates.hh_source_fingerprint` и `vacancies.hh_source_fingerprint`.
- Для наблюдаемости и безопасного multi-worker claim используются поля `integrations_accounts.sync_started_at`, `sync_lock_expires_at`, `last_sync_error`, `last_sync_error_at`.
- Кнопка **«Подключить HH.ru»** запускает только OAuth. Импорт начинается либо вручную через **«Синхронизировать»**, либо в фоне следующим циклом воркера (если авто-синк включён).
- Если в OAuth выбран личный аккаунт соискателя, пользователь возвращается в настройки без технического JSON и видит сообщение: подключение доступно только для аккаунтов работодателя.
- Практически это часто выглядит как “синк стартовал сразу после подключения”: новая интеграция создаётся с `last_synced_at = null`, и воркер подхватывает её на ближайшем цикле (обычно до `WORKER_HH_SYNC_LOOP_MS`, по умолчанию ~60 секунд).
- Пока первая автозагрузка откликов ещё идёт, настройки интеграций и страница кандидатов показывают плашку **«Загружаем отклики из HH.ru»**; страница кандидатов в это время сама обновляет список примерно раз в 30 секунд.
- Если фоновая загрузка HH-откликов завершилась ошибкой, обе страницы показывают плашку **«HH.ru не удалось загрузить отклики»** с предложением запустить синхронизацию вручную или переподключить HH.ru.
- Эти плашки относятся только к первой автозагрузке после подключения; обычные периодические HH sync циклы после успешной синхронизации не показывают их в интерфейсе.

Важно про ручную синхронизацию в UI:
- `new_only`: добавляет только новых кандидатов, у существующих обновляет только `hh_auto_survey_text`.
- `new_and_update`: перезаписывает существующие HH-карточки (имя, позиция, `resume_text`, контакты, фото, `hh_auto_survey_text`).

> Примечание про “зависшие” job’ы: `locked_at` считается **lease-меткой**.  
> Если воркер умер/потерял сеть и не обновлял `locked_at` слишком долго, функция `claim_next_ai_job` может **reclaim** такую job обратно в работу (TTL сейчас **10 минут**, см. `supabase/sql/ai_jobs.sql`).

```bash
npm run worker:start
```

### Наблюдаемость очереди (admin)

В `/admin/metrics` (platform admin) есть блок **AI Queue & Workers**:
- текущие `queued/processing`, oldest queued age
- done/failed за 24 часа + stuck processing (TTL)
- latency p50/p95: queue wait и processing time
- график по часам (enqueued/done/failed) и таблица воркеров

Требования к базе:
- `public.jobs_ai.started_at` (метрика time-to-start)
- `public.worker_heartbeats` (heartbeat воркеров)
- RPC `public.get_ai_queue_metrics(p_hours)`
- `public.candidates.hh_source_fingerprint`
- `public.vacancies.hh_source_fingerprint`
- `public.integrations_accounts.sync_started_at`
- `public.integrations_accounts.sync_lock_expires_at`
- `public.integrations_accounts.last_sync_error`
- `public.integrations_accounts.last_sync_error_at`
- RPC `public.claim_due_hh_integration(worker_id, cutoff, lease_seconds)`

Эти изменения включены в [`supabase/sql/ai_jobs.sql`](./supabase/sql/ai_jobs.sql).
Для HH sync optimization дополнительно примените [`supabase/sql/hh_sync_optimization_v1.sql`](./supabase/sql/hh_sync_optimization_v1.sql).
> Примечание: `npm run worker:start` автоматически запускает selfcheck (`preworker:start`), который собирает worker (`tsc -p tsconfig.worker.json`) и прогоняет быстрые проверки санитайзера prompt injection.
> Selfcheck запускается из уже собранного `worker/dist` (без повторной сборки). Сборка делается командой `npm run worker:build` (например, на CI/платформе деплоя).

---

## 🛡️ Prompt injection в резюме (защита)

Перед отправкой текста резюме в LLM worker делает **мягкую защиту**:

- **Детект** типовых признаков prompt injection в резюме (RU/EN паттерны).
- **Санитайзинг**: подозрительные строки заменяются на `[REDACTED_POSSIBLE_PROMPT_INJECTION]` (остальной текст сохраняется).
- **Усиление промпта**: LLM получает явные инструкции игнорировать любые “команды” внутри резюме и считать его только данными.
- **Логи (без PII)**: при детекте выводится короткая отбивка `[worker][security] prompt_injection_detected ...` + тех. метаданные (без текста резюме).

Технически: обработка выполняется в воркере перед вызовом провайдера (`worker/src/index.ts`, `worker/src/prompt-injection.ts`). Исходный `candidates.resume_text` в БД **не изменяется**.

### Важно: воркер не “искажает” резюме для ИИ

- В тексте, который **передаётся в LLM**, воркер ничего не “правит” ради качества/форматирования.
- Единственное исключение — **санитайзер prompt injection**: он заменяет только подозрительные строки на `[REDACTED_POSSIBLE_PROMPT_INJECTION]` (остальной текст сохраняется).
- Нормализация из раздела выше относится **только к JSON-ответу LLM** (пост-обработка результата, чтобы не падать на пустых массивах/пустых строках).

---

## 🎯 MVP Статус

**Текущая версия:** MVP 1.x (Supabase + async AI)

### ✅ Реализовано

- [x] Лендинг с hero, features, pricing
- [x] **Self-service регистрация + trial-ready онбординг** (лендинг ведёт на `/signup`, `/request-access` оставлен для Enterprise/демо)
- [x] Первый вход в dashboard включает мягкий путь **«Первый AI-анализ»**: пользователь может создать вакансию вручную или подключить HH.ru, затем добавить/импортировать кандидата и открыть первый результат AI-разбора. Подсказки можно завершить навсегда; финальный экран предлагает базу знаний, обратную связь и запись на демо.
- [x] Система аутентификации через Supabase Auth
- [x] Dashboard с навигацией
- [x] Страница вакансий (таблица/карточки)
- [x] Страница кандидатов с AI оценками
- [x] Календарь собеседований (MVP: планирование, перенос, отмена и завершение внутри hiiire)
- [x] Статистика Analytics v1: фильтры, воронка, цели найма, риски, AI-срезы и экспорт
- [x] Страница настроек
- [x] Адаптивный дизайн
- [x] Моковые сервисы (Auth, HH.ru, AI, Leads)
- [x] Полная документация
- [x] **Supabase DB schema + strict RLS** (production-ready база)
- [x] **Credits (DB)**: ledger + balance, подготовка к монетизации
- [x] **Teams (multi-user внутри компании)**: несколько пользователей в одной компании (roles: `admin/hr/recruiter`), общий баланс credits; вакансии/кандидаты размечены ownership и изолированы per-user (MVP), company `admin` видит всё
- [x] **Platform admin panel (Step 2)**: управление компаниями/пользователями/credits + аналитика (`/admin`)

### 🔄 В разработке

- [x] Real Supabase integration (vacancies/candidates + async jobs)
- [x] HH.ru OAuth (user-level) + импорт вакансий/откликов
- [x] Real AI analysis (Gemini async: jobs + worker)
- [x] Telegram bot notifications (webhook-only)
- [x] Email notifications (Resend)
- [ ] Google Calendar sync
- [x] Календарь собеседований (MVP: планирование, перенос, отмена и завершение внутри hiiire)
- [x] Статистика / аналитика воронки (Analytics v1)

---

## 📚 Документация

### Основная документация
- [DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md) - Схема базы данных
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Деплой на Timeweb Cloud App (web + worker + Tika extractor)

### Структура проекта

```
hiiire/
├── app/                          # Next.js App Router
│   ├── (admin)/                  # 🔒 Platform admin panel (server-side)
│   │   └── admin/
│   │       ├── login/            # /admin/login
│   │       ├── (protected)/       # ✅ все страницы ниже закрыты platform-admin guard’ом
│   │       │   ├── page.tsx       # /admin (обзор)
│   │       │   ├── companies/     # /admin/companies
│   │       │   ├── users/         # /admin/users
│   │       │   ├── credits/       # /admin/credits
│   │       │   ├── marketing/     # /admin/marketing (UTM воронка)
│   │       │   └── metrics/       # /admin/metrics (Аналитика)
│   │       └── logout/            # server action для выхода
│   ├── (marketing)/              # Лендинг
│   │   ├── page.tsx              # Главная страница
│   │   └── request-access/       # 📝 Enterprise/demo заявки
│   ├── (auth)/                   # Аутентификация
│   │   ├── login/
│   │   ├── signup/
│   │   ├── verify-email/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   └── (dashboard)/              # Личный кабинет
│       └── dashboard/
│           ├── page.tsx          # Главная
│           ├── vacancies/        # Вакансии
│           ├── candidates/       # Кандидаты
│           ├── calendar/         # Календарь
│           ├── stats/            # Статистика (NEW)
│           └── settings/         # Настройки
├── components/
│   ├── ui/                       # shadcn/ui компоненты
│   ├── landing/                  # Компоненты лендинга
│   └── dashboard/                # Компоненты dashboard
│   └── admin/                    # Компоненты admin panel
├── lib/
│   ├── supabase/                 # Supabase clients + типы БД (server/admin/browser)
│   └── utils.ts
├── services/
│   └── data/                     # Клиентские data-сервисы поверх API/Supabase
├── hooks/
│   └── use-auth.tsx              # Auth контекст на Supabase Auth
├── types/
│   └── index.ts                  # TypeScript типы
└── docs/                         # Документация
```

---

## 📱 Описание страниц

### 🏠 Лендинг (/)

Главная страница для привлечения пользователей с полным описанием продукта.

**Секции:**
- **Hero Section** - Яркий заголовок и CTA кнопка для регистрации
- **Features** - 4 ключевые возможности:
  - 🔗 Интеграция с HH.ru - автоматический импорт откликов
  - 🤖 AI анализ резюме - скоринг **соответствия вакансии** (%)
  - 📅 Умный календарь - планирование собеседований внутри hiiire
  - 💡 Советы по вакансиям - AI оптимизация описаний
- **How It Works** - Пошаговое описание работы с платформой
- **HR Assistant Promo** - промо-блок HR-ассистента с CTA на пробный запуск
- **Pricing** - тарифные планы:
  - **Starter** - 4 990₽/мес (безлимит рекрутеров/вакансий/кандидатов, 500 AI-запросов, HR-ассистент)
  - **Professional** - 9 990₽/мес (всё из Starter + 2 000 AI-запросов, HR-ассистент, приоритетная поддержка)
  - **Enterprise** - Индивидуально (всё из Professional, индивидуальные лимиты AI-запросов со скидкой, выделенный менеджер, обучение команды)
  - CTA на Starter/Professional: `Попробовать бесплатно` → `/signup?plan=...`
  - CTA на Enterprise: `Связаться с нами` → `/request-access?plan=enterprise`
- **Footer** - Навигация и информация

**Структура лендинга в коде:**
- `app/(marketing)/page.tsx` собирает лендинг из секций `Hero`, `Features`, `HowItWorks`, `HrAssistantPromo`, `InternalPortals`, `Pricing`, `PdfToolsPromo`, `Footer`.
- `components/landing/navigation.tsx` показывает гостям вход и регистрацию, а авторизованным пользователям с подтверждённым email — email и переход в `/dashboard`; при неподтверждённом email или ошибке проверки сессии остаётся гостевой вид.
- `components/landing/hr-assistant-promo.tsx` содержит промо-экран HR-ассистента перед блоком внутренних откликов; основной CTA ведёт на `/signup?plan=professional`, вторичный — к тарифам.
- `components/landing/pricing.tsx` отвечает за секцию тарифов `#pricing`; карточка Enterprise имеет отдельный якорь `#enterprise` для точечной прокрутки.
- `components/landing/pdf-tools-promo.tsx` содержит блок про бесплатные PDF-инструменты после тарифов; основной CTA открывает `https://pdf.hiiire.com`, вторичный ведёт на `/pdf-tools`.
- `components/landing/internal-portals.tsx` содержит секцию про внутренние отклики и enterprise-сценарии для крупных компаний. Название компонента историческое: здесь живёт CTA `Посмотреть Enterprise`, который должен вести на `#enterprise`, а не просто в начало секции тарифов.

---

### 📝 Оставить заявку (/request-access)

Страница для Enterprise-запросов и записи на демо. Self-service поток для большинства пользователей идёт через `/signup`.

- `/pdf-tools` — публичная SEO-страница про PDF-инструменты для HR. Редактор открывается на `https://pdf.hiiire.com`; hiiire не хранит PDF-файлы этого инструмента.

**Форма заявки:**
- 📝 Имя и Фамилия (обязательно)
- 📧 Email (обязательно)
- 📞 Телефон (обязательно)
- 🏢 Компания (обязательно)
- 👥 Размер компании (опционально)
- 💬 Сообщение (опционально)

**Функционал:**
- Валидация всех полей
- Для email действует единое правило валидации на клиенте и сервере: адрес должен быть в формате `name@company.com`; если после `@` нет точки, форма подскажет это явно
- Для телефона используется общий валидатор: до 50 символов, только цифры и телефонные символы (`+`, пробел, скобки, дефис), для Enterprise-заявок нужен полный номер
- Проверка на дубликаты email
- Сохранение заявок через серверный API
- Success экран с подтверждением
- Автоматический редирект на главную через 3 секунды
- Отправка toast уведомлений
- Для Enterprise-формы доступны явные CTA выхода:
  - возврат к тарифам в `/dashboard/settings?tab=plan`, если пользователь пришёл из настроек тарифа
  - возврат к блоку тарифов на главной, если пользователь пришёл с лендинга
- Для `requestedPlan=enterprise`:
  - неавторизованные пользователи и авторизованные пользователи без company context оставляют публичный lead как и раньше
  - авторизованный `admin` компании создаёт `billing_plan_change_requests`, а не публичный lead; это работает и с лендинга, и из Settings → Тариф
  - авторизованные `hr/recruiter` видят понятное ограничение; серверный `POST /api/leads` возвращает `403` с `error="PLAN_CHANGE_REQUIRES_ADMIN"`
  - если у компании уже есть активный Enterprise, сервер возвращает `PLAN_ALREADY_ACTIVE`, а UI показывает состояние «Enterprise уже подключён»
  - статус активной заявки компании подтягивается через `GET /api/billing/plan-change-request` и показывается в `/dashboard/settings?tab=plan`; любая активная billing request блокирует новую Enterprise-заявку и кнопки выхода из Enterprise, чтобы UI не обещал новую заявку поверх существующей
  - публичные Enterprise-leads по-прежнему можно переоткрыть после отказа: пользователь видит причину отказа (`decision_note`, если она указана) или дружелюбный fallback-текст и может отправить заявку повторно

**Преимущества для MVP:**
- ✅ Контроль доступа к платформе
- ✅ Сбор контактов потенциальных клиентов
- ✅ Возможность последовательной онбордингa пользователей
- ✅ Получение обратной связи от заинтересованных компаний

> Важно: в Supabase **таблица `leads` защищена** (чтение/изменение — только admin внутри компании). Для production-потока заявки нужно писать **сервер-сайд** (Edge Function / Next.js Route Handler) с использованием `SUPABASE_SERVICE_ROLE_KEY`, чтобы не открывать запись из браузера и не допустить спам/утечки.

---

### 🔐 Аутентификация (для внутреннего доступа)

**Login (/login)**
- Email/Password форма входа
- Валидация полей
- Пароль валидируется на клиенте тем же лимитом длины, что signup/reset: от 6 до 72 символов
- Для поля пароля доступен eye-toggle (показать/скрыть пароль)
- Ссылка `Забыли пароль?` ведёт на `/forgot-password`
- Между последним полем и основной CTA-кнопкой используется явный вертикальный отступ, чтобы форма не выглядела “слипшейся”
- Supabase Auth — реальные пользователи, созданные через `/admin` или self-service signup, могут входить по паролю
- Доступ к dashboard после входа
- Если email не подтверждён — редирект на `/verify-email` (без `?email=...`)

**Signup (/signup)**
- Регистрация нового пользователя
- Поля: Имя, Email, Телефон, Компания, Пароль
- Email валидируется одинаково на клиенте и сервере: адрес должен содержать `@` и домен с точкой; для адресов вроде `name@company` показывается отдельная понятная ошибка
- Телефон валидируется одинаково на клиенте и сервере: до 50 символов, только цифры и телефонные символы (`+`, пробел, скобки, дефис)
- Пароль валидируется одинаково на клиенте и сервере: от 6 до 72 символов, без пробелов, только латинские буквы, цифры и знаки
  - Для полей `Пароль` и `Подтвердите пароль` доступен eye-toggle (каждое поле переключается независимо)
  - Между последним полем и кнопкой `Создать аккаунт` сохранён нормальный вертикальный ритм
- Используется Supabase Auth `signUp` (+ metadata)
- Поддерживается `?plan=starter|professional` (сохраняется в `company_plans.intended_plan`, по умолчанию `starter`)
- `?plan=enterprise` не проходит через self-service signup и редиректит на `/request-access?plan=enterprise`
- После публичного signup server-side триггер `handle_new_user` создаёт компанию/профиль, ставит trial на 7 дней и начисляет 50 credits
- Для создания пользователя из `/admin/users` `handle_new_user` использует отдельную ветку (по `app_metadata.provisioning_mode='company_member'` + `provisioning_source='platform_admin'`): создаёт только `profiles` в выбранной компании и с выбранной ролью (`admin/hr/recruiter`)
- Базовая защита от абьюза триала: один trial на email (`public.trial_email_usage`)
- При включённом email confirmation — редирект на `/verify-email` (без email в query)

**Verify email (`/verify-email`)**
- Email на экране берётся из server-side verification context (signed `HttpOnly` cookie), а не из query/localStorage/sessionStorage.
- Supabase email confirmation link живёт **1 час**: в Dashboard `Email OTP expiration = 3600 seconds`.
- Локальный verification context живёт **15 минут** и нужен только для текущего браузера: он хранит email для экрана `/verify-email` и не определяет срок действия email-ссылки.
- Кнопка `Отправить повторно` вызывает backend endpoint (`POST /api/auth/resend-verification`) без передачи email из клиента.
- Ограничения resend:
  - cooldown: 60 секунд между отправками
  - rate limit: максимум 5 resend в час на конкретный email
- Лимит хранится на сервере и общий для всех вкладок, окон, инкогнито-сессий и инстансов приложения. Новый verification context для того же email счётчик не сбрасывает.
- Если в другой вкладке начата новая регистрация/вход неподтверждённым email, текущая вкладка покажет уведомление и актуальный email.
- Если старый verification context относится к уже подтверждённому email, `/verify-email` показывает, что email подтверждён, и предлагает войти.
- При успешном callback (`/auth/callback`) verification context очищается.

**Supabase Auth email templates**
- Репозиторный источник HTML-шаблонов Supabase Auth хранится в `supabase/auth-email-templates/`.
- Supabase Dashboard не читает эти файлы автоматически: после правки нужно скопировать HTML из нужного файла в соответствующий шаблон в `Authentication -> Emails`.
- Шаблоны используют `/auth/confirm?token_hash={{ .TokenHash }}` вместо `{{ .ConfirmationURL }}`, чтобы сервер приложения подтверждал email/recovery через текущий callback-flow.
- В Supabase URL Configuration для production должны быть разрешены `https://hiiire.com/auth/callback` и `https://hiiire.com/auth/confirm`.
- `change-email.html` подготовлен заранее, но пользовательской механики смены email в интерфейсе пока нет.

**Forgot password (`/forgot-password`)**
- Форма запроса ссылки восстановления по email.
- Используется server-side endpoint `POST /api/auth/password-reset` (валидация + anti-enumeration + cooldown/rate-limit).
- UI всегда показывает универсальный ответ: «Если аккаунт существует, мы отправили ссылку...».
- Между полем email и кнопкой `Отправить ссылку` есть отдельный вертикальный отступ, как и на других auth-экранах.
- Ограничения запроса восстановления:
  - cooldown: 60 секунд между отправками
  - rate limit: максимум 5 запросов в час на password reset context
  - дополнительные ограничения от Supabase отражаются как `SUPABASE_RATE_LIMIT`
- При невалидной/протухшей recovery-ссылке callback ведёт на `/forgot-password?error=invalid_or_expired`.

**Reset password (`/reset-password`)**
- Страница установки нового пароля (поля: новый пароль + подтверждение).
- Для полей `Новый пароль` и `Подтвердите пароль` доступен eye-toggle (каждое поле переключается независимо).
- Валидация совпадает с signup: от 6 до 72 символов, без пробелов, только латинские буквы, цифры и знаки; пароли должны совпадать.
- После успешного перехода по recovery-ссылке (через `/auth/callback`) вызывается `supabase.auth.updateUser({ password })`.
- После успешной смены пароля — toast и редирект на `/dashboard`.
- Если recovery-сессия отсутствует/истекла — показывается ошибка и CTA на `/forgot-password`.

**Auth API endpoints (password recovery)**
- `GET /api/auth/password-reset` — получить текущий password reset context (`email/maskedEmail/cooldown`).
- `POST /api/auth/password-reset` — отправить ссылку восстановления (`{ email }`) с anti-enumeration.
- `DELETE /api/auth/password-reset` — очистить password reset context.

**Примечание:** Основные CTA лендинга ведут на `/signup` и `/signup?plan=starter|professional`, а `/request-access` используется для Enterprise и демо.

---

## 🛡️ Platform admin panel (Step 2)

Админка нужна владельцу сервиса для:
- управления компаниями/пользователями (включая помощь клиентам)
- управления credits (начисления/списания)
- продуктовой аналитики для тарифов и понятного статуса роста

### Роуты
- `/admin/login` — вход
- `/admin` — обзор
- `/admin/companies` — компании + “создать компанию + admin user”, поиск по `name/id` и server-side пагинация
- `/admin/users` — пользователи + “создать пользователя в компании”, смена роли `admin/hr/recruiter` (**только platform admin**), удаление, поиск по `name/id` и server-side пагинация; в форме создания пользователя компания выбирается через searchable dropdown (по названию или точному `company_id`), в выдаче показываются `name + company_id`
- `/admin/credits` — баланс по компаниям + ledger + ручные корректировки, поиск по компании (`name/id`) и независимая пагинация для обеих таблиц
- `/admin/marketing` — конструктор UTM-ссылок + UTM-воронка first-touch: визиты, регистрации, компании, оплаты и выручка по источникам за 7/30/90 дней; оплаты и выручка включают подписки и пополнения credits, ниже постраничный список конкретных регистраций с пользователем и компанией
- `/admin/metrics` — **Аналитика** (базовые метрики + графики)

> Техническая деталь: `/admin/login` находится **вне** защищённого layout’а, чтобы не было redirect-loop.  
> Все остальные страницы `/admin/*` обслуживаются из `admin/(protected)` и требуют platform admin.

### Как выдаётся доступ
Доступ к `/admin` есть только у пользователей, которые находятся в таблице `platform_admins`.

Для назначения себя platform admin можно выполнить в Supabase SQL Editor:

```sql
insert into public.platform_admins (user_id)
values ('<your-auth-user-uuid>');
```

### Безопасность (важно)
- Любые админские операции выполняются **только сервер-сайд** с использованием `SUPABASE_SERVICE_ROLE_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` **никогда не должен попадать в браузер** (не `NEXT_PUBLIC_*` и не в client components).

### Модель доступа (Hybrid: RLS + server-side guards)

В проекте используется **гибридная модель**, которая сочетает “defense-in-depth” от Supabase (RLS) и предсказуемую бизнес-логику на сервере:

- **RLS в Supabase**: защищает данные при **чтении из браузера** (все запросы через `anon`/JWT обязаны проходить через политики).
- **Server-side записи**: критичные операции **записи/изменения** выполняются через Next.js Route Handlers (`/api/*`) с:
  - проверкой сессии пользователя (cookie → `supabase.auth.getUser()`)
  - явными guards (company boundary + ownership/roles)
  - выполнением DB операций через `service_role` (server-only), чтобы не зависеть от хрупких RLS insert/update policy на окружениях.

Почему так: сложные write-права (teams/roles/ownership) удобнее и надёжнее поддерживать в одном месте (guards), при этом RLS остаётся страховкой от утечек при прямом доступе к PostgREST.

Примеры:
- `POST /api/candidates` — создание кандидата делается server-side (guards + `service_role`), т.к. прямой insert через RLS может ломаться при рассинхроне политик.
- `/api/jobs`, `/api/jobs/bulk`, `/api/credits/*` — server-side (guards + `service_role`/RPC) по той же причине (транзакционность, биллинг, защита).

---

## 💳 Credits (монетизация) — модель данных

Кредиты считаются **на уровне компании** (`company_id`) и разделяются между пользователями компании. При этом доступ к данным в MVP сделан так:
- `hr/recruiter` видят только свои вакансии/кандидатов (ownership)
- company `admin` видит всё внутри компании

SQL для включения multi-user isolation (новое окружение / обновление политик): [`supabase/sql/company_team_isolation.sql`](./supabase/sql/company_team_isolation.sql)

> Важно: этот скрипт **переустанавливает RLS политики** на ключевых таблицах (удаляет старые и создаёт новые), чтобы не было «расширяющих» старых policy.

### Как устроено

- **`company_credits`**: быстрый баланс по компании:
  - `balance` — общий баланс
  - `reserved` — зарезервировано под in-flight AI jobs
  - **available** для UI = `balance - reserved`
- **`credit_ledger`**: append-only история изменений (дельты `delta`, причина `reason`, ссылка `reference_*`).
- **`credit_reservations`**: reserve/capture/release для AI jobs (чтобы нельзя было поставить в очередь больше, чем есть available).
- **`platform_admins`**: сервисная роль “админ платформы” (ты) для админки продукта (видеть всех, начислять/списывать, смотреть метрики).
- **`ai_analyses`**: добавлены поля для аналитики себестоимости и биллинга:
  - `credits_charged` (сколько списали за анализ)
  - `used_ocr` (OCR не отдельным тарифом, но сигнал для себестоимости)
  - `provider_model`, `tokens_in`, `tokens_out` (provider-reported usage для расчёта cost; worker заполняет, если API вернул usage)

### Security notes

- Клиентские роли **не могут** менять баланс напрямую: `company_credits` read-only.
- `credit_ledger` **append-only**, любые update/delete блокируются триггером.
- `credit_reservations` закрыта от браузера: **RLS включён + deny-all policy** (доступ только server-side/service_role/RPC).
- Запись в `credit_ledger` по RLS разрешена **только platform admin** (для ручных корректировок). Серверная логика (service_role) сможет списывать кредиты при анализе.

### API заметка (UX)
- `/api/credits/balance` возвращает `balance`, `reserved`, `available` — UI использует **available** для preflight перед пачкой.

---

### 🎯 Dashboard - Главная (/dashboard)

Центр управления с ключевыми метриками и активностью.

**Основные виджеты:**
- **Статистика:**
  - 📋 Активные вакансии - количество открытых позиций
  - 👥 Кандидаты - в процессе рассмотрения
  - 📅 Собеседования - будущие запланированные собеседования до конца недели по продуктовой timezone `Europe/Moscow`; для admin отдельно показываются свои собеседования и собеседования сотрудников, если есть оба типа
  - 📊 Среднее соответствие вакансии - средний скоринг кандидатов по вакансии

- **Последняя активность:**
  - До 5 последних событий из общей ленты активности
  - Создание вакансий, создание кандидатов и списания кредитов за AI-анализ
  - Время событий показывается абсолютной датой и временем, сконвертированными из серверного timestamp
  - Статистика и последняя активность загружаются независимо: ошибка одного блока не ломает второй
  - Ссылка ведёт на `/dashboard/activity`

### 🧾 Активность (/dashboard/activity)

Единая лента событий компании с фильтрами и пагинацией.

**Типы событий:**
- Создание вакансий
- Создание кандидатов
- Списание кредитов за AI-анализ

**Права доступа:**
- `admin` видит события создания всех вакансий и кандидатов компании.
- `hr` и `recruiter` видят только свои события создания вакансий и кандидатов.
- Списания кредитов видны всем пользователям компании, потому что баланс общий.
- В событиях списания показывается, кто потратил кредиты и сколько списано, но email автора не отдаётся в клиентский ответ.

**Фильтры и пагинация:**
- Фильтры: все события, кандидаты, вакансии, кредиты.
- URL хранит `type`, `page`, `pageSize`; некорректные значения нормализуются.
- Используется та же пагинация, что и в списках кандидатов/вакансий.
- Кнопки открытия кандидата или вакансии из ленты открывают карточку в новой вкладке, чтобы текущая лента не теряла позицию.

- **Статистика по кандидатам:**
  - Распределение по статусам с цветовыми индикаторами
  - Новые, На рассмотрении, Собеседование, Оффер, Приняты, Отклонены

**Действия:**
- Кнопка "Создать вакансию"
- Переход к детальным страницам через клик на карточки

---

### 📋 Вакансии (/dashboard/vacancies)

Управление всеми вакансиями компании.

**Функционал:**
- **Фильтрация:**
  - По статусу (Все / Активные / На паузе / Черновики / Закрытые)
  - Если по выбранному статусу нет результатов, показывается отдельная нейтральная заглушка **«По выбранному фильтру вакансии не найдены»** с действием **«Сбросить фильтр»**
  - Онбординг **«Создать первую вакансию»** показывается только когда вакансий нет вообще, а не когда фильтр дал `0` результатов

- **Пагинация (масштабирование)**:
  - Список вакансий загружается **страницами** (серверная пагинация)
  - На **desktop**: `Назад/Вперёд` + номера страниц + многоточия
  - На **mobile**: компактный режим из 3 контролов (`Назад`, выбор страницы, `Вперёд`)
  - Параметры сохраняются в URL: `page`, `pageSize`, `status`
  - Если `page` в URL выходит за диапазон (например, после фильтрации/смены `pageSize`), страница автоматически нормализуется до валидной
  
- **Два режима отображения:**
  - **Таблица** - компактный список с колонками:
    - Название и зарплатная вилка
    - Локация
    - Уровень опыта: Стажер (Trainee), Начальный (Junior), Средний (Middle), Высокий (Senior), Ведущий (Lead)
    - Статус с цветовыми бэйджами (**inline-редактирование** по клику)
    - Дата создания
    - Действия
  
  - **Карточки (Grid)** - визуально насыщенные карточки:
    - Полное описание вакансии
    - Все ключевые параметры
    - Тип занятости
    - Зарплата
    - Статус с быстрым изменением по клику на бейдж

- **Детальная карточка вакансии (по клику):**
  - Клик по строке/карточке открывает подробную панель:
    - **Desktop**: справа (`Sheet`)
    - **Mobile**: полноэкранно (`Drawer`)
  - Внутри панели:
    - **Редактирование вакансии** (форма + сохранение без перезагрузки)
    - **Быстрое изменение статуса** по клику на статусный бейдж
    - **Тег источника**: `Вручную` или `HH.ru` (если есть `hhruVacancyId`)
    - Для `HH.ru` вакансий: **Синхронизация с HH.ru** с подтверждением, что синк перезапишет контент вакансии, но **не меняет локальный статус** (`status`)
    - Индикатор **«Есть правки / Синхронизировано / Не синхронизировано»** и **«Последняя синхронизация: …»**
    - Форма вакансии сделана **компактной**:
      - **Основные поля** — всегда видны
      - **«Дополнительно»** — спрятано под спойлер (и показывает бейдж с количеством заполненных доп. полей, включая структурные поля `requirements`/`responsibilities`)

**Поля вакансии (основные + дополнительные):**
- **Основные (всегда видны в форме):**
  - Название (`title`)
  - Локация (`location`)
  - Занятость (`employmentType`)
  - Уровень (`experienceLevel`: Стажер (Trainee), Начальный (Junior), Средний (Middle), Высокий (Senior), Ведущий (Lead))
  - Статус вакансии (`status`)
  - Описание (`description`)
- Вилка зарплаты (`salaryMin/salaryMax/salaryCurrency`) — опционально
  - `salaryCurrency` выбирается через **searchable dropdown** по полному списку ISO 4217, свободный ввод отключён
  - `salaryMin` и `salaryMax` принимают целые суммы и допускают максимум **15 цифр** (`<= 999_999_999_999_999`)
  - в форме пробел, точка и запятая в группах по три цифры считаются разделителями тысяч: `500.500`, `500,500` и `500 500` сохраняются как `500500` и форматируются как `500 500`
  - если введены буквы или символы, форма показывает inline-ошибку и toast: **«Введите сумму цифрами»**
  - если введена дробная сумма (`100,5`, `120000.75`), форма показывает inline-ошибку и toast: **«Введите целую сумму без копеек»**
  - если сумма «от» больше суммы «до», форма показывает inline-ошибку и toast: **«Сумма «от» должна быть меньше или равна сумме «до».»**
  - при превышении лимита форма показывает inline-ошибку и toast: **«Зарплата не может быть больше 15 цифр»**
  - при сохранении валюта валидируется и на клиенте, и на API; произвольные строки не принимаются
- **Дополнительно (под спойлером «Дополнительно»):**
  - Структурирование вакансии:
    - Требования (`requirements`) — опционально, каждая строка отдельным пунктом, до **2000 символов** на поле
    - Обязанности (`responsibilities`) — опционально, каждая строка отдельным пунктом, до **2000 символов** на поле
  - Подразделение (`department`)
  - Руководитель / заказчик (`hiringManager`)
  - План найма (`headcount`)
  - График (`workSchedule`)
  - Оформление (`employmentForms`: один или несколько вариантов ТК/ГПХ/Самозанятость/ИП/Другое)
  - Зарплата (детали): период (`salaryPeriod`: месяц/час/смена), налоги (`salaryTax`: gross/net)
  - Испытательный срок (`probationMonths`)
  - Командировки (`travelPercent`)
  - Условия / бонусы (`benefits`, `bonus`)
  - Обязательные требования (`mandatoryRequirements`)
  - Процесс найма (`hiringProcess`)

> UX заметка: в табе «Детали» в карточке вакансии **пустые доп. поля не показываются**, чтобы не было “сетки из прочерков”.

> UX заметка: в табе «О вакансии» блоки **«Требования»** и **«Обязанности»** показываются только если там есть данные (без заглушек «Не указаны»).

> UX заметка: если у старой вакансии в `salaryCurrency` лежит историческое невалидное значение, форма покажет его как неподдерживаемое и попросит выбрать валидную валюту из списка перед сохранением.

> UX заметка: в desktop-таблице списка вакансий длинные названия **переносятся на несколько строк**, а колонки «Создана» и «Действия» имеют стабильную ширину, чтобы служебные действия не наезжали на дату создания.

**DB (миграция):**
- В Supabase базовые hiring-поля добавлены миграцией **`vacancies_real_hiring_fields`**.
- Уровень **`trainee` / «Стажер (Trainee)»** добавлен миграцией **`vacancy_experience_level_trainee`**.
- Если вы разворачиваете новый проект/окружение — примените эти миграции (либо перенесите SQL-изменения в свои миграции) до запуска web/worker.

**Статусы вакансий:**
- 🟢 Активна - принимает отклики
- 🟡 На паузе - временно приостановлена
- ⚫ Черновик - в процессе создания
- 🔴 Закрыта - позиция заполнена

> UX заметка: при переводе вакансии в **«Закрыта»** показывается подтверждение, чтобы избежать случайного закрытия.

---

### 👥 Кандидаты (/dashboard/candidates)

AI-powered управление кандидатами с интеллектуальной оценкой.

**Пагинация (масштабирование):**
- Список кандидатов загружается **страницами** (серверная пагинация)
- На **desktop**: `Назад/Вперёд` + номера страниц + многоточия
- На **mobile**: компактный режим из 3 контролов (`Назад`, выбор страницы, `Вперёд`)
- Параметры сохраняются в URL: `page`, `pageSize`, `vacancy`, `score`, `candidateStatus`, `sort`, `q` — при обновлении страницы и навигации назад/вперёд состояние и список восстанавливаются из URL
- Поле **«Поиск по ФИО»** фильтрует кандидатов по `candidates.name` на стороне Supabase, поэтому ищет по всему доступному списку, а не только по текущей странице; слова ФИО можно вводить в любом порядке
- Фильтр **«Вакансия»** открывается как список с поиском по названию вакансии, чтобы выбирать нужную позицию на больших списках
- Фильтр **«Статус кандидата»** сужает список по текущему статусу кандидата и не конфликтует с `status`-параметром аналитических drilldown-ссылок
- При смене `page`, `pageSize`, фильтров или сортировки список переходит в явное состояние загрузки: вместо предыдущих карточек показывается `transition skeleton` (grid/list), чтобы не было рассинхрона URL и контента
- В компактном инфо-баре во время этого перехода показывается статус `Загрузка списка…`; индикатор `Обновляем AI…` используется только для фонового polling AI-статусов
- Во время фонового polling AI-статусов пользовательские интерактивные элементы не должны терять состояние: dropdown смены статуса кандидата остаётся открытым, пока пользователь сам не выберет значение или явно не закроет меню
- Если `page` в URL выходит за диапазон (например, `?page=999` при малом количестве записей), страница автоматически нормализуется до валидной
- Статусы AI jobs подгружаются только для кандидатов текущей страницы (быстро даже при 1000+)
- Отображаемые ФИО/позиция нормализуются (лишние пробелы/`NBSP`) один раз при подготовке данных страницы (memo), чтобы избежать лишних пересчётов на каждый ререндер

**Добавление кандидатов:**
- **Кнопка "Добавить"** - открывает модальное окно для добавления кандидатов
- **Требование**: кандидат всегда привязан к вакансии. Если вакансий нет — сначала создайте вакансию (можно **Черновик**) и продолжайте добавление.
- **Два метода добавления:**
  - **Загрузка файла (PDF/DOC/DOCX/TXT)** - до 10 файлов (макс **5MB** каждый; лимит извлечённого текста **до 50 000 символов / 8 000 слов**)
    - можно выбрать сразу несколько (multi-select), перетащить пачкой (drag&drop) или добавить файлами в несколько заходов (append)
    - список файлов редактируемый (удаление отдельных файлов), дубликаты отфильтровываются
    - серверные проверки: тип файла, лимит размера, таймаут обработки файла, пустой/нечитаемый файл, лимит по объёму текста
    - если файл не удалось прочитать, пользователь видит **точную понятную причину ошибки** в toast и в строке именно этого файла, а не технический код парсера
    - если файл превышает лимит **5 МБ**, UI показывает **одно точное уведомление** о размере файла без дублирующего сводного toast, чтобы сообщение не перекрывалось
  - **Текстовое описание** - до 5 полей с описанием кандидатов (макс 5000 символов каждое)
- **Способы добавления взаимоисключающие**: после выбора файла вкладка **«Ввести описание»** блокируется до удаления файлов; после ввода описания вкладка **«Загрузить файл»** блокируется до очистки описаний.
- **AI-анализ (опционально)** — автоматический анализ кандидата с расчётом **соответствия вакансии**
  - для HH-кандидатов при наличии автоопроса в отклике в анализ также передаётся `HH автоопрос` (sanitized, как недоверенный ввод)
  - для новых HH-импортов `resume_text` сохраняется без raw JSON-хвоста (в AI уходит нормализованный текст резюме + `hh_auto_survey_text`)
- **Сразу видно в списке**: кандидат появляется в основном списке **сразу после создания**:
  - либо с job в очереди (если анализ запущен),
  - либо **без анализа** (если пользователь выбрал “добавить без анализа” / нет доступных кредитов / тариф не оплачен).
- **Прогресс-индикатор** - отображение процесса обработки множественных кандидатов (queued/processing/done/failed)
- Ошибки обработки файла показываются в строке конкретного файла и остаются там до удаления или повторной загрузки файла; короткий текст остаётся в списке, подробное безопасное сообщение раскрывается через tooltip/popover по hover/focus без поломки layout.
- Имя, должность и контакты могут заполниться автоматически из резюме. Если автозаполнение не сработало, кандидат всё равно создаётся, а поля можно поправить вручную; интерфейс не должен показывать технические сообщения про DeepSeek, JSON, токены, rate limit или внутренний parser.
- Желаемая зарплата также может заполниться автоматически из резюме и сохраняется в `candidates.desired_salary_*`; UI показывает только эти structured fields и не парсит `resume_text` на клиенте.
- **Быстрая постановка в очередь**: при добавлении пачки кандидатов создание кандидатов/постановка AI job выполняются параллельно (по умолчанию до 3 одновременно) — чтобы большие загрузки не шли строго по одному.
- После принятия пачки AI-анализ продолжается в фоне. Если пользователь закрывает окно добавления и открывает его снова, новая пачка не ждёт завершения прошлого AI-анализа.
- **UX-защита от путаницы**: когда в модалке уже показаны результаты пачки, основная кнопка становится **«Готово»** (закрыть), а не «Добавить».
- Кнопка **«Повторить»** показывается только для реальных ошибок AI-анализа, когда кандидат уже создан; для ошибок валидации/парсинга файла UI не обещает retry и показывает саму причину отказа.
- **Хранение файла резюме (опционально)**: чекбокс **«Сохранить файл резюме»** (по умолчанию выключен)
  - если включить — исходный файл (PDF/DOC/DOCX/TXT) сохраняется в Supabase Storage (private bucket `resumes`) и доступен для скачивания из карточки кандидата через серверный endpoint
  - для сохранения и скачивания DOC bucket `resumes` должен разрешать `application/msword`; до применения Storage MIME update через Supabase MCP проверять DOC можно без чекбокса сохранения файла
  - путь объекта в Storage не зависит от имени файла пользователя: оригинальное имя хранится отдельно в `resume_file_name` и возвращается при скачивании
  - если выключить — сохраняются только данные кандидата + извлечённый текст для анализа, скачать файл нельзя

**Недостаточно кредитов или тариф не оплачен — что происходит:**
- кандидаты всё равно **добавляются** в список (без AI-анализа; `match_percentage = NULL`)
- если недостаток кредитов известен до отправки, перед добавлением показывается preflight-диалог:
  - при `0` кредитов: заголовок **«Недостаточно кредитов для AI-анализа»**, текст начинается с **«У вас сейчас нет кредитов.»**, primary-кнопка **«Добавить без анализа»**
  - при частичной нехватке: заголовок **«Не хватает кредитов для всех кандидатов»**, primary-кнопка **«Продолжить (X)»**
  - в футере не более двух кнопок: **«Позже»** + primary; вторичные действия вынесены в ссылки (**«Перейти в тариф»**, а для частичной нехватки ещё **«Добавить без анализа»**)
- если после отправки выяснилось, что тариф не оплачен, строки файлов показывают **«Без анализа»**, а общий toast: **«Кандидаты добавлены без AI-анализа»** с действием **«Открыть тариф»**
- анализ можно запустить позже кнопкой **«Запустить AI анализ»** (если анализа ещё не было) или **«Повторить»** (если прошлый запуск завершился ошибкой)
- защита от “спама”: если нажимать **«Запустить AI анализ» / «Повторить»** много раз подряд (при медленной сети/загрузке), **не создастся пачка одинаковых задач** — запросы и постановка job идемпотентны

**Массовый запуск AI-анализа (bulk):**
- В режиме `score=unscored` доступна панель **«Оценить ИИ»** с двумя сценариями:
  - **На странице** — ручной выбор чекбоксами текущего листа.
  - **По фильтрам** — массовый запуск по текущему скоупу фильтров (`vacancy`, `score=unscored`) без ручной отметки каждой страницы.
- В режиме **«На странице»**:
  - выбор кандидатов сохраняется при переходах между страницами в рамках текущего скоупа (`vacancy` + `score` + `sort`),
  - кнопка **«Выбрать все»** дополняет текущий выбор (а не перезаписывает его),
  - при смене фильтров/сортировки, выходе из режима выбора или после успешного bulk-запуска выбор очищается.
- Для сценария “по фильтрам” используется лимит количества:
  - **слайдер + числовой инпут** (синхронизированы),
  - порядок отбора — по текущей сортировке списка по дате (`date_desc` / `date_asc`).
- Если запрошено больше, чем доступно кредитов, выполняется **авто-ограничение** количества, а UI показывает явное уведомление.
- Если выбранный кандидат на текущей странице перестал быть `unscored` (например, анализ завершился в фоне), он автоматически убирается из текущего выбора.
- Для массового запуска используется отдельный endpoint `POST /api/jobs/bulk`:
  - на сервере выполняется проверка доступа (company boundary + роли),
  - в режиме `mode=ids` в enqueue попадают только кандидаты с `match_percentage IS NULL` (уже проанализированные не ставятся повторно),
  - пропускаются кандидаты, у которых уже есть `queued/processing/done` job,
  - enqueue выполняется параллельно с ограничением concurrency для ускорения больших запусков.

**Фильтры:**
- **Quick row (всегда видимая):**
  - `Вакансия` (Select)
  - `Соответствие` (chips: Все / Не просчитаны / Высокое / Среднее / Низкое)
- **Панель `Фильтры`:**
  - `Сортировка` (дата/оценка)
  - `Сбросить фильтры`
- Параметры фильтрации и сортировки остаются URL-driven: `vacancy`, `score`, `sort`

**Два режима отображения:**
- **Карточки (Grid)** - детальные карточки с:
  - Аватар и основная информация
  - На промежуточных desktop-ширинах сетка снижает плотность до **2 колонок**; **3 колонки** используются только на действительно широких экранах
  - ФИО и позиция показываются в **1 строку** (`truncate`), полный текст доступен в нативной подсказке (`title`)
  - Желаемая зарплата показывается отдельной строкой под позицией, если сохранена в structured fields кандидата
    - для ручного добавления значение может прийти из AI/parser fallback по тексту резюме
    - для HH-кандидатов значение приходит из HH resume salary; если HH возвращает пустое значение, строка скрывается
  - Строка вакансии / даты / источника (`HH.ru`) в шапке карточки адаптивная: при нехватке ширины элементы переносятся на новую строку и не выходят за границы карточки
  - **Соответствие вакансии (%)** — единственный основной показатель (прогресс-бар)
  - Контакты (email/телефон/мессенджеры/ссылки) — можно копировать, открывать и редактировать; телефон проверяется общим валидатором и не принимает буквы
  - **Комментарий** - редактируемое поле для заметок о кандидате (макс 500 символов)
  - Статус кандидата с цветовым кодом
  - Для узких экранов статусный бейдж в шапке карточки переносится адаптивно (без выхода за границы карточки, текст статуса не обрезается)
  - Кнопки действий (Резюме / Назначить собеседование)
    - **Резюме**:
      - для `source=HH.ru` и при наличии `hhruResumeId` открывается ссылка `https://hh.ru/resume/{hhruResumeId}`
      - для не-HH кандидатов работает текущая логика открытия/скачивания сохранённого файла резюме
      - если резюме недоступно: для не-HH tooltip **«Функция в разработке»**, для HH без ID tooltip **«Резюме HH недоступно»**
    - **Назначить собеседование**: открывает форму создания встречи с уже выбранным кандидатом и его вакансией

- **Список** - компактный вид для быстрого просмотра
  - На промежуточных desktop-ширинах блоки внутри карточки списка раскладываются в несколько строк, чтобы не было наложения метрик, контактов и кнопок
  - ФИО и позиция показываются в **1 строку** (`truncate`), полный текст доступен в нативной подсказке (`title`)
  - Желаемая зарплата из structured fields кандидата отображается под позицией в компактном виде (`text-xs`, `truncate`)
  - Отображает существующие комментарии в компактном формате
  - Тот же адаптивный паттерн для статусного бейджа: перенос при нехватке ширины без переполнения

**Детальная карточка кандидата (по клику):**
- Клик по карточке открывает подробную панель:
  - **Desktop**: справа (`Sheet`)
  - **Mobile**: полноэкранно (`Drawer`)
- **Header панели**:
  - Аватар, ФИО, статус, позиция, вакансия
  - ФИО и позиция в шапке панели также однострочные (`truncate`) с показом полного текста через `title`
  - Статусный бейдж в хедере также адаптивный: при узкой ширине переносится, не вылезая за контейнер
  - Кнопка **«Резюме»** в хедере использует ту же логику, что и в списке/карточках (HH-ссылка при `source=HH.ru`, tooltip в disabled-состоянии)
  - Кнопка **«Назначить собеседование»** открывает ту же форму календаря и подставляет кандидата/вакансию
  - Блок соответствия: % с цветной цифрой + нейтральный progress bar
  - **Главный вывод** — `ai_analyses.verdict` (если пусто — fallback на `ai_analyses.summary`)
- **Вкладки**: AI анализ / Резюме / Данные
- **AI анализ**: `ai_analyses.reasons` (3 буллета), сильные/слабые стороны, рекомендации, оценка по категориям
- **Если AI анализ не запускался/не выполнен**:
  - при `available=0` показывается CTA **«Перейти к тарифу»**
  - если анализ не запускался и кредиты доступны — CTA **«Запустить AI анализ»**
  - если анализ завершился ошибкой и кредиты доступны — CTA **«Повторить»**
  - повторные клики по **«Запустить AI анализ» / «Повторить»** во время запуска безопасны: UI блокирует кнопку, бэкенд не создаёт дубликаты job
- **Резюме**: извлечённый текст резюме
  - для legacy HH-записей, где в `resume_text` исторически был хвост `Полные данные HH.ru (JSON): ...`, этот хвост скрывается в UI
- **Данные**: контакты, дата подачи, источник, желаемая зарплата (если сохранена), заметка
  - для `source = HH.ru`: отдельный read-only блок **«HH автоопрос»** (снимок `chat_bot.auto_survey.text`)
- Компоненты: `components/dashboard/candidate-details.tsx`, `hooks/use-media-query.tsx`

**Контакты кандидата (таблица `candidate_contacts`):**
- Контакты хранятся в отдельной таблице `public.candidate_contacts` (source of truth).
- При добавлении кандидата из файла резюме или текста контакты **best-effort** парсятся из `resume_text` и записываются в `candidate_contacts`.
- В UI контакты можно **добавлять/редактировать/удалять**, а также **копировать** и **открывать** (mailto/tel/t.me/wa.me/https).
- Для ссылочных типов контактов используются человекочитаемые подписи; `habr_career` в карточке кандидата отображается как **Habr Career**.

**Интерпретация соответствия вакансии:**
- 🟢 85+ - "Отлично подходит"
- 🟡 70-84 - "Хорошо подходит"
- 🔴 <70 - "Низкое соответствие"

**Статусы кандидатов:**
- 🔵 Новый
- 🟡 Рассмотрение
- 🟠 Проверка СБ
- 🟣 Собеседование назначено
- 🟣 Опрошен
- 🟢 Оффер
- 🟢 Принят
- 🔴 Отклонён

---

### 📅 Календарь (/dashboard/calendar)

Планирование, перенос, отмена и завершение собеседований внутри hiiire.

**3 вкладки:**

1. **Календарь:**
   - FullCalendar с режимами week/month/day/list
   - В режимах недели и дня виден полный день от 00:00 до 24:00
   - Создание встречи из свободного слота календаря или кнопки **«Новое собеседование»**
   - Создание встречи из карточки кандидата через **«Назначить собеседование»**
   - В форме создания/редактирования встречи поля вакансии, кандидата и интервьюеров поддерживают поиск; длинные списки прокручиваются внутри выпадающего блока
   - Если у выбранной вакансии нет кандидатов, список кандидатов остаётся пустым, форма показывает подсказку и не даёт назначить собеседование
   - Собеседование можно назначить только на вакансию в статусе **active** или **paused**
   - Поле даты и времени показывает текущий часовой пояс пользователя; сами плашки встреч в сетке календаря остаются без дополнительной timezone-подписи
   - Детали события открываются по клику на встречу
   - Карточки собеседований показывают:
     - Кандидат с аватаром
     - Вакансия
     - Время, длительность и текущий часовой пояс пользователя
     - Тип собеседования (Видео/Телефон/Офис)
     - Ссылка на встречу
     - Заметки, включая итоговую заметку завершения или причину отмены
     - Действия (Изменить/Отменить/Завершить)
   - Если рекрутер назначен интервьюером, но не имеет доступа к карточке кандидата или вакансии, он видит имя кандидата, название вакансии, время, тип, ссылку на встречу или место проведения; ссылки на карточки, заметки и действия управления не показываются

2. **Предстоящие:**
   - Список будущих собеседований, а не только текущего диапазона календаря
   - Поиск по собеседованиям
   - Фильтр по статусу: все, запланировано, завершено, отменено
   - Пагинация и выбор размера страницы
   - Выбранная вкладка, поиск, статус, страница и размер страницы восстанавливаются из URL после обновления или возврата назад

3. **Все собеседования:**
   - Полная история и будущие встречи, а не только текущий диапазон календаря
   - Поиск по собеседованиям
   - Фильтр по статусу: все, запланировано, завершено, отменено
   - Пагинация и выбор размера страницы
   - Выбранная вкладка, поиск, статус, страница и размер страницы восстанавливаются из URL после обновления или возврата назад
   - Статусы событий

**Типы собеседований:**
- 📹 Видео - с ссылкой на встречу
- 📞 Телефон - контактный номер
- 📍 Офис - адрес
- 💻 Техническое - специальный формат

**Обязательные поля при создании/переносе:**
- Кандидат
- Вакансия
- Дата и время
- Длительность: по умолчанию 30 минут, допустимый диапазон от 5 до 480 минут
- Тип
- Интервьюеры

Если у выбранного интервьюера или кандидата уже есть встреча на это время, hiiire сначала показывает предупреждение о пересечении и не сохраняет событие. Пользователь может проверить конфликт и повторить сохранение через **«Сохранить всё равно»**.

Запланированное собеседование можно завершить вручную в любой момент: календарь не блокирует завершение будущей встречи, если команде нужно зафиксировать такой статус заранее.

**Совместная работа:**
- Календарь realtime-aware: вкладки пользователей одной компании получают приватный сигнал `calendar_changed`, затем проверяют актуальный fingerprint через guarded API.
- Такой же сигнал отправляется при изменении имени кандидата или названия вакансии, если эти данные видны в событиях календаря.
- Открытые формы, карточки деталей и диалоги отмены/завершения не перезаписываются автоматически. Вместо этого показывается **«Календарь обновился»** и действие **«Обновить»**.
- Если realtime недоступен, календарь проверяет изменения через резервный режим без утверждения, что изменения уже есть.

**Статусы:**
- 🔵 Запланировано
- 🟢 Завершено
- 🔴 Отменено

В этом релизе календарь работает внутри hiiire: активной Google Calendar синхронизации и внешних уведомлений о встречах нет.

**Rollout note для realtime/optimistic concurrency:**
- Применить [`supabase/sql/interviews_realtime_v1.sql`](./supabase/sql/interviews_realtime_v1.sql) до деплоя app-кода, который вызывает 4-argument `cancel_interview_mvp` / `complete_interview_mvp` с `expectedUpdatedAt`.
- Применить [`supabase/sql/interviews_rpc_cleanup_v1.sql`](./supabase/sql/interviews_rpc_cleanup_v1.sql) только после того, как все app-инстансы отправляют `expectedUpdatedAt`; скрипт удаляет старые 3-argument overloads cancel/complete RPC.
- `/api/interviews/changes` считает fingerprint по полному видимому snapshot календаря. Это осознанный performance risk для небольших диапазонов; пересмотреть перед расширением диапазонов или ростом объёма интервью.

---

### ⚙️ Настройки (/dashboard/settings)

- `/dashboard/settings` содержит настройки профиля, компании, интеграций, уведомлений и тарифа; заявки на Enterprise из тарифов возвращают пользователя обратно на вкладку `plan`.

### 💬 Обратная связь (/dashboard/feedback)

- `/dashboard/feedback` собирает продуктовую обратную связь: путь **«Поделиться идеей»** сохраняет обращение в таблицу `feedback`, а путь **«Что-то не работает»** открывает Omnidesk-форму поддержки через кастомную кнопку без стандартной плавающей кнопки виджета.
- `/admin/feedback` позволяет platform admins читать и классифицировать продуктовые обращения из встроенной формы; обращения об ошибках обрабатываются в Omnidesk и не появляются в этом списке.
- Порядок миграций для этого раздела двухфазный: сначала `supabase/sql/product_feedback_v1_additive.sql`, после деплоя и проверки нового приложения - `supabase/sql/product_feedback_v2_finalize.sql`.

---

### 📈 Статистика (/dashboard/stats)

Аналитика найма для admin, HR и рекрутера с роль-зависимым доступом, целями и экспортом.

**Возможности:**
- KPI карточки: план найма, открытые и закрытые вакансии, вакансии под риском, AI-покрытие, time-to-fill.
- Глобальные фильтры: период, вакансия, статус вакансии, департамент, город, источник, статус кандидата, AI-порог, только риск и давно без движения.
- Сохранённые виды фильтров: личные для всех ролей и общие для компании через admin.
- Цели найма: настройка company/vacancy целей, SLA без движения и минимального pipeline для admin.
- Вкладки: обзор, воронка, вакансии, источники, команда для admin, AI и экспорт.
- Drill-down: переходы из аналитики в списки кандидатов и вакансий сохраняют контекст возврата.
- Экспорт XLSX/CSV использует те же фильтры и role-scope, что и экран статистики.

**DB:**
- Для корректных метрик закрытий и time-to-fill в новых окружениях примените `supabase/sql/vacancy_closed_at_foundation.sql`.
- Закрытия считаются по фактическому переходу вакансии в статус «Закрыта»; обычное редактирование закрытой вакансии не должно менять дату закрытия.

---

## 🧹 TODO (план): удалить legacy `ai_score` из БД

UI использует только `candidates.match_percentage`. Поле `candidates.ai_score` — legacy, **больше не заполняется** и подлежит удалению миграцией.

**Что нужно будет сделать:**
- **DB**:
  - удалить колонку `candidates.ai_score`
  - удалить индекс `idx_candidates_ai_score` (если есть)
- обновить типы (`worker/src/database.types.ts`, `lib/supabase/database.types.ts`) после миграции
- **UI/Docs**:
  - убрать остаточные упоминания `AI Score` и заменить на “соответствие вакансии”


Управление профилем, компанией, интеграциями и подпиской.

**5 вкладок:**

1. **Профиль:**
   - Личная информация (Имя, Email)
   - Роль (Администратор/HR/Рекрутер) — **read-only**, изменить может только **platform admin**
   - Сохранение изменений

2. **Компания:**
   - Название компании
   - Индустрия (Технологии/Финансы/Здравоохранение/Образование)
   - Размер компании (1-10 / 11-50 / 51-200 / 201-500 / 500+)
   - Для роли `admin` отображается блок **«Сотрудники компании»** (Имя, Email, Роль) со списком пользователей из той же компании (`company_id`)
   - Для `hr/recruiter` блок сотрудников не отображается
   - **Важно**: менять данные компании может только **admin компании** (HR/Recruiter — только просмотр)
   - API:
     - `GET /api/company`
     - `PATCH /api/company` (guard: `requireCompanyContext` + `role === 'admin'`; название компании: 2-120 символов; ошибки валидации возвращаются с пользовательским `message` и `issues[].message`)
     - `GET /api/company/employees` (guard: `requireCompanyContext` + `role === 'admin'`)

   3. **Интеграции:**
      - **HH.ru API:**
        - Статус подключения
        - OAuth авторизация (user-level)
        - Импорт активных вакансий
        - Импорт откликов/кандидатов с автопривязкой к импортированным вакансиям
        - Для новых импортов `resume_text` сохраняется как нормализованный текст резюме без raw JSON-блока
        - Для HH-импортов при наличии `resume.photo` сохраняется `avatar_url` кандидата (с приоритетом: `small`, `medium`, `100`, `40`, `500`)
        - Для откликов HH сохраняется последний снимок автоопроса в карточке кандидата (`hh_auto_survey_text`, до 4000 символов)
        - Режимы ручной синхронизации кандидатов:
          - предпросчёт в диалоге перед запуском: `Будет добавлено X, обновлено Y`
          - `Только новые резюме` (добавляет только новых; у существующих HH-кандидатов обновляет только HH автоопрос, фото не меняется)
          - `Новые и обновить старые` (перезапись имени, должности, текста резюме, контактов, фото и HH автоопроса из HH.ru)
   
   - **AI Провайдер:**
     - OpenAI
     - Google Gemini
     - DeepSeek
   
   - **Google Calendar:**
     - Интеграция зарезервирована для следующего релиза; активной синхронизации собеседований сейчас нет

4. **Уведомления:**
   - 🔔 Новые кандидаты
   - 🤖 AI анализ завершён
   - 📧 Email уведомления

5. **Тариф:**
  - Отображение текущего тарифа (Trial/Starter/Professional/Enterprise)
  - Для Trial: обратный отсчёт до `trial_expires_at` + рекомендованный план (`intended_plan`, если задан)
  - Для paid-планов: период подписки `periodStart/periodEnd`, `autoRenew`, статус биллинга `active|grace|inactive`
  - Paid Starter/Professional без `periodEnd` считается неактивным: AI-функции выключены до новой оплаты, вечный доступ по legacy-строке не выдаётся
  - Баннер trial-состояний (`trial_active`, `trial_expiring`, `trial_expired`) на всех страницах дашборда
  - Отображение кредитов компании: **доступно** (`available`) + расшифровка **всего** (`balance`) и **в резерве** (`reserved`)
  - Admin может докупить кредиты без смены тарифа через кнопку **«Пополнить баланс»** рядом с балансом. Пресеты: 50/100/300/600, кастомное количество — только цифры до 5 знаков, цена — 15 ₽ за кредит. Кнопка оплаты в модалке активируется только после согласия с публичной офертой и политикой конфиденциальности
  - Пополнение credits — одноразовый Robokassa checkout без `Recurring=true`; успешный webhook пишет grant в общий `credit_ledger`, поэтому докупленные credits отображаются в том же `company_credits.balance`
  - Повторная докупка того же количества credits переиспользует pending top-up checkout в течение 15 минут через DB RPC с advisory lock. Новая ссылка получает `ExpirationDate`, но валидная поздняя оплата всё равно зачисляется: `requires_review` используется только для mismatch по сумме/id/статусу
  - Для бухгалтерии top-up сохраняет фискальный `fiscal_receipt`, передаёт encoded `Receipt` и подтверждённый email пользователя в Robokassa, включает этот же encoded `Receipt` в `SignatureValue`; callback payload сохраняется в `provider_payload`. После успешного webhook админам компании отправляется best-effort Telegram/Email уведомление о зачислении
  - В `/admin/credits` пополнения видны отдельным блоком **«Пополнения кредитов»**: компания, Robokassa `InvId`, payment id, статус, время завершения, fail/review reason, признак подготовленного чека, признак provider callback, количество credits и сумма. В обычном ledger они также проходят как `reason='grant'`, `reference_type='credit_topup_payment'`
  - Карточки планов с основными ограничениями и преимуществами
  - Смена тарифа доступна **только admin компании** (HR/Recruiter — read-only)
  - Starter/Professional: self-service checkout через Robokassa (`/api/billing/checkout` → redirect). Первый платёж передаёт в Robokassa `Email` подтверждённого пользователя и encoded fiscal `Receipt` с номенклатурой подписки; `Receipt` участвует в `SignatureValue`
  - Повторный immediate checkout переиспользует pending invoice только в течение короткого TTL (15 минут) и только при полном совпадении company/plan/amount/currency/auto-renew intent; старые pending invoices не возвращаются как свежий checkout
  - Новые immediate invoices хранят `payments.checkout_expires_at`; `/api/billing/checkout` и cron `billing-renewals` переводят просроченные new-model pending invoices в `failed` с `fail_reason='EXPIRED'`, не трогая legacy pending без expiry. Если такая Robokassa-ссылка всё же оплачена после cleanup, webhook переводит payment в `requires_review` без изменения тарифа и credits
  - Для immediate checkout ссылка Robokassa получает `ExpirationDate`, но webhook/RPC всё равно самостоятельно проверяет TTL
  - Возврат из Robokassa: UI проверяет статус оплаты через `GET /api/billing/checkout-result?invId=...` (сервер-авторитетный статус)
  - Понижение Professional → Starter: при включённом автопродлении можно запланировать на следующий период (`POST/DELETE /api/billing/schedule-downgrade`); повторное подтверждение того же понижения на ту же дату показывает тост «Понижение уже запланировано» и не отправляет новое расписание; при выключенном автопродлении новая оплата Starter создаётся на следующий период, а Professional остаётся активным до `periodEnd`
  - Direct checkout Professional → Starter при активном Professional не создаёт immediate downgrade: при `autoRenew=true` backend возвращает guard для schedule-flow, при `autoRenew=false` используется paid scheduled downgrade. Если у legacy paid Professional нет `periodEnd`, checkout блокируется с `PLAN_PERIOD_END_REQUIRED`
  - Для оплаченного будущего понижения UI показывает дату перехода и tooltip с пояснением, что Starter уже оплачен и включится в указанную дату
  - Оплаченный future checkout хранит immutable intent в `payments`; webhook не переоценивает scheduled downgrade по текущему `auto_renew`, поэтому последующее включение автопродления не активирует Starter раньше даты перехода
  - Оплаченный будущий переход нельзя перезаписать обычным расписанием или повторным checkout; автопродление будущего периода включается только если сам оплаченный invoice имеет recurring mandate
  - Если future invoice оплачивается после окончания Professional, Starter активируется сразу на новый месяц от даты оплаты; прошедший период не продаётся
  - Если future invoice стал stale из-за админского Enterprise-перевода до webhook, payment переводится в `requires_review`, текущий тариф не меняется
  - Для non-scheduled immediate invoice успешный период начинается от `completed_at`; поздняя оплата после `checkout_expires_at` или конфликт с текущим Enterprise/активным higher plan переводит payment в `requires_review` без изменения доступа и credits
  - Enterprise: подключение только через `/request-access?plan=enterprise` (без self-service checkout на сам Enterprise); уход с Enterprise и изменение условий Enterprise выполняются через `billing_plan_change_requests` из Settings → Тариф, self-service checkout в Starter/Professional блокируется `ENTERPRISE_CHANGE_REQUIRES_SUPPORT`. После применённого Enterprise exit целевой Starter/Professional остаётся inactive без paid period, и Settings разрешает обычный checkout этого же тарифа.
  - Legacy Enterprise leads в `/admin/tariff-requests` больше не переключают `company_plans` напрямую: статус `qualified` фиксирует sales-решение, а подключение компании оформляется через `/admin/billing` как approved `billing_plan_change_requests` → `enterprise_agreements` → activation RPC. Если был оплачен будущий Starter, он переводится в `requires_review` при activation RPC в той же DB-транзакции
  - Если текущий тариф уже `Enterprise` и статус биллинга `active`, admin видит CTA **«Изменить условия»**. Платформенный админ создаёт новую agreement/amendment с `replaces_agreement_id`; activation RPC завершает прежнюю active agreement и активирует новую в одной транзакции.
  - Для ролей `hr/recruiter` Enterprise CTA в настройках disabled; оставить Enterprise-заявку может только `admin` компании
  - Recurring: daily cron `/api/cron/billing-renewals`, до 3 попыток (1/день), grace 3 дня, далее `auto_renew=false`; этот же cron активирует оплаченные будущие понижения тарифа и чистит expired immediate checkouts. Для каждого recurring-списания cron передаёт в Robokassa `Email` первого admin-профиля компании и encoded fiscal `Receipt` подписки; если email для чека не найден, списание не отправляется провайдеру
  - Recurring renewal защищён DB-инвариантом: для одного company + parent invoice + renewal period может быть только один active attempt (`pending|completed|requires_review`); failed attempts остаются retryable по лимиту выше
  - `company_plans.robokassa_inv_id` хранит последний/текущий оплаченный invoice периода; `company_plans.recurring_mandate_inv_id` хранит root invoice первого recurring-capable платежа. Cron всегда передаёт root invoice как Robokassa `PreviousInvoiceID`, а idempotency recurring attempts остаётся на `company + root parent_inv_id + period_start`
  - Auto-renew можно включить только если root parent Robokassa payment завершён и помечен `payments.recurring_mandate_activated=true`; legacy completed invoices с прежним `activate_auto_renew=true` backfill-ятся как recurring-capable, обычные invoices без recurring intent не подходят
  - Fallback: при `ROBOKASSA_RECURRING_ENABLED=false` checkout идёт без `Recurring=true`, webhook выставляет `auto_renew=false`, cron renewals возвращает `reason="RECURRING_DISABLED"`
  - Enterprise manual invoices: hiiire заранее резервирует Robokassa `InvId` в `billing_manual_invoices.provider_invoice_id` из отдельной high-range sequence и передаёт его в Invoice API вместе с обязательным email плательщика и `InvoiceItems` для фискализации. JWT для Invoice API формируется по контракту Robokassa: `Header` и `Payload` кодируются в Base64Url, HMAC `Signature` — в Base64 без padding, а `OutSum` и `InvoiceItems[].Cost` передаются числовыми рублёвыми значениями. Счёт выставляется только из `draft` Enterprise agreement со связанной approved billing request: DB RPC в одной транзакции создаёт `draft` manual invoice row с зарезервированным `InvId` и переводит agreement в `pending_payment`, и только после этого API вызывает Robokassa. Черновой Enterprise agreement можно отменить до выставления счёта; отмена блокируется, если по agreement есть `draft`, `issued`, `paid` или `requires_review` manual invoice. Если provider call вернул неоднозначную ошибку или provider-created invoice не удалось локально перевести в `issued`, invoice остаётся в `requires_review`, agreement остаётся в `pending_payment`, а platform admin вручную подтверждает оплату или отклоняет invoice в Manual Invoices. Подтвердить оплату можно только для последнего счёта agreement, при provider URL или paid webhook review и только пока agreement всё ещё `pending_payment`; отклонить review invoice можно только если у него нет provider payable URL и нет paid webhook review по текущему invoice cycle. Старый callback-only paid review после re-issue можно закрыть как не применённый к текущему циклу. Счёт с URL или current paid webhook review можно только подтвердить после проверки оплаты. После подтверждения оплаты newest linked manual invoice agreement можно активировать; старые оплаченные invoices после restore/re-issue не подходят для activation. После безопасного отклонения review invoice agreement можно вернуть в `draft`. Если текущий newest invoice истёк, отменён, возвращён или ушёл на проверку без provider-created/payment evidence, platform admin может вернуть `pending_payment` agreement в `draft`. Restore всегда блокируется, если любой linked invoice содержит provider payable URL; `issued`, `paid` и paid webhook review блокируют restore только когда это newest invoice cycle. Основной ResultURL `POST /api/billing/robokassa-webhook` сначала ищет self-service payment, затем credit top-up payment, затем Enterprise manual invoice по `InvId`; отдельный `POST /api/billing/manual-invoice-webhook` оставлен как совместимый endpoint. Валидный callback переводит только статус `issued` в `paid`, сохраняет provider payload и не включает Enterprise agreement без действия платформенного админа. Повторный callback для уже оплаченного invoice отвечает успешно и не меняет запись; draft/terminal/review статусы сохраняют provider payload и переходят в `requires_review`, а не игнорируются. Platform admin может обновить статус provider-created invoice через Robokassa Invoice API; если провайдер вернул `expired`/`canceled`/`refunded`, payable URL очищается и restore снова доступен. `issued` или `requires_review` invoice с provider URL можно отменить только через provider-side deactivation, после чего ссылка очищается локально.
  - API: `GET /api/billing/plan`, `POST /api/billing/checkout`, `POST /api/billing/credit-topup`, `GET /api/billing/credit-topup-result`, `POST /api/billing/robokassa-webhook`, `POST /api/billing/manual-invoice-webhook`, `POST /api/cron/billing-renewals`
  - Credits API: `GET /api/credits/balance`
  - Уведомления (toast) при успешной/неуспешной оплате

**Статус интеграций:**
- ✅ HH.ru интеграция реализована (OAuth + импорт)
- 🔜 Google Calendar / прочие провайдеры — позже

---

## 🔑 Локальная разработка

### 🚀 MVP Подход: Self-service + Enterprise lead flow

Основной поток на лендинге:
- `Попробовать бесплатно` → `/signup` (или `/signup?plan=starter|professional`)
- `/request-access` остаётся отдельным потоком для Enterprise и демо-запросов
- Прямой вход на `/signup?plan=enterprise` автоматически перенаправляется в Enterprise lead flow: `/request-access?plan=enterprise`
- Сценарий заявок (`leads`) используется как дополнительный канал квалификации, а не основной вход в продукт

Для локального входа используйте реальные аккаунты Supabase. Их можно создать через self-service signup или через административный сценарий проекта, если он доступен в вашем окружении.

---

## 🛠️ Разработка

### Доступные команды

```bash
# Запуск dev сервера
npm run dev

# Сборка production
npm run build

# Запуск production локально
npm run start

# Линтинг
npm run lint
```

### Добавление shadcn/ui компонентов

```bash
npx shadcn@latest add [component-name]
```

Пример:
```bash
npx shadcn@latest add button
npx shadcn@latest add card
```

---

## 🚀 Деплой (RU-friendly)

Проект разворачивается на **Timeweb Cloud App** как отдельные приложения из одного репозитория:
- `hiiire-web` (Next.js UI + API)
- `hiiire-worker` (очередь `jobs_ai` + Gemini)
- `hiiire-tika` (Docker Compose: защищённый Node/Fastify proxy + `apache/tika:${TIKA_IMAGE_TAG:-3.2.3.0}`)
- `hiiire-telegram-relay` (standalone Telegram webhook/send relay for `tg.hiiire.com`)

`hiiire-web` можно разворачивать текущим non-compose способом (`npm run build` / `npm run start`) или отдельным Docker image из `Dockerfile.web`. `hiiire-worker` пока остаётся на non-compose настройках деплоя (`npm run worker:build` / `npm run worker:start`). `hiiire-tika` разворачивается отдельным Timeweb App типа **Docker Compose**. `hiiire-telegram-relay` разворачивается отдельным Dockerfile-based Timeweb App из project directory `telegram-relay`.

Docker build для web:

```bash
docker build \
  -f Dockerfile.web \
  -t hiiire-web \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
  .
```

`NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` обязательны на этапе build, потому что Next.js встраивает public env в браузерный bundle. Runtime secrets передаются при запуске контейнера через env/secret settings хостинга. Docker healthcheck использует `GET /api/health`.

Web env for Tika contains only the web-to-proxy connection settings:

```env
TIKA_BASE_URL=https://your-tika-proxy.example.com
TIKA_AUTH_TOKEN=...
TIKA_TIMEOUT_MS=20000
```

Keep the web `TIKA_TIMEOUT_MS` greater than the proxy `TIKA_UPSTREAM_TIMEOUT_MS` so the proxy can return classified timeout or unavailable responses before the web request aborts.

`hiiire-tika` Docker Compose/proxy env is configured on the separate Tika App:

```env
TIKA_AUTH_TOKEN=...
TIKA_UPSTREAM_URL=http://tika:9998
TIKA_UPSTREAM_TIMEOUT_MS=12000
TIKA_IMAGE_TAG=3.2.3.0
POSTHOG_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_SERVICE_NAME=tika-proxy
```

`hiiire-tika` health check должен идти в proxy `GET /health`: он возвращает `200` только когда внутренний `apache/tika` уже доступен, иначе `503`.

Ветка/деплой для Tika содержит корневой `docker-compose.yml`, потому что Timeweb Docker Compose читает именно файл с таким именем из корня репозитория. Этот compose-файл предназначен только для отдельного Tika App. Если когда-нибудь UI или worker тоже переводятся на Docker Compose, нужно заранее развести deployment layout, чтобы один корневой `docker-compose.yml` не конфликтовал между Tika App и web/worker compose-деплоем.

Для сохранения оригинальных `.doc` резюме private bucket `resumes` в Supabase Storage должен разрешать `application/msword` в `allowed_mime_types`. Это изменение применяется только через Supabase MCP после проверки, что MCP `project_ref` совпадает с проектом из `NEXT_PUBLIC_SUPABASE_URL`.

Инструкции: [`DEPLOYMENT.md`](./DEPLOYMENT.md)

---

## 🗺️ Roadmap

### v1.0 - MVP (Текущая) ✅
- Лендинг с pricing
- **Система сбора заявок** (контролируемый запуск)
- Аутентификация через Supabase
- Основной функционал на Supabase/API
- Полная документация
- Адаптивный дизайн

### v1.1 - Lead Management
- **Backend для заявок** (Supabase)
- Email уведомления о новых заявках
- Admin панель для управления заявками
- Автоматическая отправка приглашений
- CRM интеграция (опционально)
- **PostHog** - метрики посещаемости и продуктовая аналитика

### v1.2 - Production Ready
- Расширение Supabase-интеграций для основного функционала
- Улучшение auth/security сценариев
- Database schema deployment

### v1.3 - Integrations
- HH.ru OAuth
- AI analysis (OpenAI/Gemini)
- Email notifications для пользователей

### v1.4 - Enhancements
- Google Calendar sync
- Advanced analytics
- Team collaboration
- Export functionality

### v2.0 - Enterprise
- Multi-company support
- Advanced permissions
- API for third-party
- White-label options

---

## 🤝 Contributing

- Как поднять проект локально, правила веток, проверки перед PR и требования к коду — в [CONTRIBUTING.md](./CONTRIBUTING.md).
- Баги и предложения — через issues по шаблонам (Баг / Предложение).
- Уязвимости — только приватно, см. [SECURITY.md](./SECURITY.md).
- Участвуя в проекте, вы соглашаетесь с [Кодексом поведения](./CODE_OF_CONDUCT.md).

---

## 📄 License

Copyright © 2025–2026 hiiire authors.

hiiire распространяется под лицензией [GNU Affero General Public License v3.0](./LICENSE) (`AGPL-3.0-only`). Вы можете использовать, изменять и распространять код, в том числе разворачивать его как сетевой сервис, при условии, что исходный код ваших изменений будет доступен пользователям этого сервиса на тех же условиях.

Название «hiiire» и логотип не входят в лицензию на код: форки и собственные инсталляции должны использовать своё название и брендинг.

---

## 🙏 Благодарности

- [Next.js](https://nextjs.org/) - The React Framework
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Supabase](https://supabase.com/) - Backend as a Service
- [Timeweb](https://timeweb.cloud/) - RU-friendly hosting

---

**Сделано с ❤️ для HR специалистов**
