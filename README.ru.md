# hiiire

![hiiire](./.project_documentation_and_meta/hiiire_main_logo_with_background.png)

[English](./README.md) | **Русский**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

hiiire — open-source CRM для подбора персонала (ATS) с AI-оценкой резюме, HR-ассистентом и интеграцией с HH.ru. Сделана на Next.js и Supabase.

Продукт рассчитан на российский рынок: интерфейс на русском, вакансии и отклики приходят из HH.ru, оплата идёт через Robokassa. Подробное описание поведения системы — в [техническом справочнике](./docs/technical-reference.md).

---

## Возможности

- **Интеграция с HH.ru**: OAuth работодателя, импорт вакансий и откликов, фоновая синхронизация (по желанию).
- **AI-анализ резюме**: процент соответствия вакансии, сильные и слабые стороны, рекомендации. Анализ идёт асинхронно в worker; поддерживаются OpenAI, Gemini и DeepSeek с автоматическим переключением на запасного провайдера.
- **HR-ассистент**: чаты внутри CRM. Ассистент ищет по вакансиям, кандидатам и собеседованиям команды и предлагает изменения, которые выполняются только после подтверждения пользователя. Права доступа те же, что и во всей CRM.
- **Загрузка резюме**: PDF, DOC, DOCX и TXT. Текст извлекает защищённый сервис Apache Tika, по нему заполняется карточка кандидата.
- **Календарь собеседований**: назначение, перенос, отмена и завершение собеседований.
- **Аналитика**: воронка найма, цели найма, риски и AI-срезы, экспорт.
- **Команды**: несколько пользователей в компании с ролями `admin`, `hr` и `recruiter` и общий баланс AI-кредитов.
- **Биллинг**: подписки Starter и Professional и разовые пополнения кредитов через Robokassa. Для Enterprise — счета, которые выставляются вручную.
- **Уведомления**: Telegram-бот (только webhook) и email через Resend.
- **Админка платформы** (`/admin`): компании, пользователи, кредиты, маркетинговая атрибуция и метрики очереди AI.
- **Контент**: блог и база знаний хранятся в репозитории в Markdown, есть SEO-проверки.
- Светлая, тёмная и системная темы.

## Архитектура

В репозитории несколько сервисов, которые разворачиваются отдельно:

| Сервис | Путь | Назначение |
| --- | --- | --- |
| `hiiire-web` | корень репозитория | Next.js 16 App Router: интерфейс и API routes (`app/api/*`) |
| `hiiire-worker` | `worker/` | Node.js-воркер: обрабатывает очередь `jobs_ai` (AI-анализ) и при желании синхронизирует HH.ru |
| `hiiire-tika` | `tika-proxy/`, `docker-compose.yml` | Fastify-прокси с авторизацией перед Apache Tika для извлечения текста резюме |
| `hiiire-telegram-relay` | `telegram-relay/` | Необязательный отдельный relay для Telegram webhook и исходящих запросов к Bot API |

Web-приложение и worker общаются только через Supabase (Postgres): web ставит AI-задачи в очередь, worker забирает их, вызывает AI-провайдера и записывает результат. Браузер не обращается к Supabase напрямую. Все данные идут через `/api/*` на том же домене; эти маршруты на сервере проверяют компанию и роль пользователя поверх Row Level Security.

## Технологии

- **Фронтенд**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, React Hook Form, Zod
- **Бэкенд**: Supabase (Postgres, Auth, Storage), Node.js-воркер
- **AI**: OpenAI, Gemini, DeepSeek
- **Интеграции**: HH.ru API, Robokassa, Telegram Bot API, Resend, PostHog, Apache Tika

## Быстрый старт

### Что понадобится

- Node.js `>= 20.9` (проверено на `22.17`) и npm `>= 10`
- Отдельный Supabase-проект для разработки (облачный или self-hosted). Никогда не подключайте локальную сборку к production-базе.

### 1. Установите зависимости

```bash
npm ci
```

### 2. Создайте схему БД

Примените SQL-файлы из [`supabase/migrations/`](./supabase/migrations) к пустому Supabase-проекту по порядку имён файлов, например через `psql` или SQL-редактор Supabase. Что входит в bootstrap и как он собирается, описано в [`supabase/bootstrap/README.md`](./supabase/bootstrap/README.md).

### 3. Настройте окружение

```bash
cp .env.example .env.local
```

Минимум для запуска:

| Переменная | Назначение |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | URL Supabase-проекта и публичный ключ |
| `SUPABASE_SERVICE_ROLE_KEY` | Серверный ключ для API routes и worker |

Остальные интеграции выключены, пока не заданы их переменные:

| Функция | Переменные |
| --- | --- |
| AI-анализ резюме (worker) | `AI_PROVIDER`, `OPENAI_API_KEY` / `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` |
| HR-ассистент и автозаполнение карточки кандидата | `DEEPSEEK_API_KEY` |
| HH.ru | `HH_ru_client_id`, `HH_ru_client_secret`, `HH_RU_REDIRECT_URI` |
| Загрузка файлов резюме | `TIKA_BASE_URL`, `TIKA_AUTH_TOKEN` |
| Уведомления в Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` |
| Email-уведомления | `RESEND_API_KEY`, `EMAIL_FROM` |
| Оплата | `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD1`, `ROBOKASSA_PASSWORD2`, `CRON_SECRET` |
| Продуктовая аналитика | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |
| Реквизиты оператора на юридических страницах | `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_INN`, `LEGAL_OPERATOR_OGRN`, `LEGAL_OPERATOR_REGISTRATION_DATE` |

Полный список с комментариями — в [`.env.example`](./.env.example).

Если `LEGAL_OPERATOR_*` не заданы, юридические страницы (`/terms`, `/privacy`, `/refund`, `/contact`, `/about`) открываются без реквизитов. Локально это нормально, в production реквизиты обязательны.

### 4. Запустите

```bash
npm run dev            # web-приложение на http://localhost:3000
```

AI-анализ работает в отдельном процессе:

```bash
npm run worker:build
npm run worker:start
```

Создайте аккаунт через `/signup`. Чтобы добавлять кандидатов, сначала создайте хотя бы одну вакансию.

## Команды

| Команда | Что делает |
| --- | --- |
| `npm run dev` | Dev-сервер |
| `npm run build` / `npm run start` | Production-сборка и запуск |
| `npm run lint` | ESLint |
| `node --no-warnings --experimental-strip-types --test tests/*.test.mts` | Все тесты (Node test runner) |
| `npm run test:*` | Группы тестов, например `test:content`, `test:telegram`, `test:resume-extraction` |
| `npm run worker:build` / `npm run worker:start` | Сборка и запуск worker |
| `npm run telegram-relay:test` | Тесты Telegram relay |
| `npm run content:check` / `npm run content:lint` | Проверки блога и базы знаний |

## Деплой

В production каждый сервис работает отдельным приложением, собранным из этого репозитория. Web-приложение можно также собрать в Docker-образ из `Dockerfile.web`. Настройка, переменные окружения, cron-задачи и health checks — в [DEPLOYMENT.md](./DEPLOYMENT.md).

## Документация

- [Технический справочник](./docs/technical-reference.md): поведение каждой страницы, API endpoints, биллинг, AI-пайплайн, синхронизация с HH.ru, уведомления и SQL-миграции.
- [Схема базы данных](./docs/DATABASE_SCHEMA.md) (на английском)
- [Работа с контентом](./docs/content-workflow.md) (на английском)
- [Руководство для ручного QA](./docs/For_juniors/hiiire_for_junior.md)

## Участие в разработке

Будем рады вашему вкладу. Как поднять проект, как устроены ветки, что проверить перед pull request и каких правил держаться в коде — в [CONTRIBUTING.md](./CONTRIBUTING.md). Баги и идеи присылайте через шаблоны issues.

Об уязвимостях сообщайте только приватно, как описано в [SECURITY.md](./SECURITY.md). Участвуя в проекте, вы соглашаетесь с [Кодексом поведения](./CODE_OF_CONDUCT.md).

## Лицензия

Copyright © 2025–2026 hiiire authors.

hiiire распространяется под лицензией [GNU Affero General Public License v3.0](./LICENSE) (`AGPL-3.0-only`). Код можно использовать, изменять и распространять, в том числе запускать как сетевой сервис, если исходный код вашей изменённой версии доступен пользователям этого сервиса на тех же условиях.

Название «hiiire» и логотип не входят в лицензию на код: форки и собственные инсталляции должны использовать своё название и брендинг.

## Благодарности

[Next.js](https://nextjs.org/), [Supabase](https://supabase.com/), [shadcn/ui](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/), [Apache Tika](https://tika.apache.org/).
