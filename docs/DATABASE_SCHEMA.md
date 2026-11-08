# Database Schema - hiiire.com

## 📋 Overview

This document defines the Supabase database schema for hiiire.com production deployment.

For recovery into an empty self-hosted Supabase installation when no database
dump is available, use the repository bootstrap documented in
[`supabase/bootstrap/README.md`](../supabase/bootstrap/README.md). The generated
migration is the canonical ordered composition of the recovered baseline and
the SQL changes in `supabase/sql`; it restores schema, RLS, RPC, triggers, and
Storage policy metadata, but not users or application data.

Since 2026-07-02 production web, worker, and Telegram relay use the self-hosted
instance at `https://supabase.hiiire.com`. Runtime integration details are
documented in [`supabase/selfhost/README.md`](../supabase/selfhost/README.md).

## 🗄️ Database: PostgreSQL (via Supabase)

### Why Supabase?
- Built-in authentication
- Real-time subscriptions
- Row Level Security (RLS)
- Auto-generated APIs
- Storage for resume files
- Easy integration with Next.js

## 📊 Schema Design

### Core Tables

#### 1. **users** (Handled by Supabase Auth)
Supabase provides this table automatically. We extend it with:

```sql
-- Extended user profile
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  company_id UUID REFERENCES companies(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'recruiter')),
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 2. **companies**
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  logo_url TEXT,
  industry TEXT,
  size TEXT,
  -- initial stage: user = company, so company is created on signup
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 2.1 **first_ai_onboarding_states**

User-scoped state for the guided "Первый AI-анализ" onboarding flow.

```sql
CREATE TABLE first_ai_onboarding_states (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  started_path TEXT CHECK (started_path IN ('manual', 'hh')),
  completed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  hh_oauth_error_at TIMESTAMPTZ,
  hh_started_at TIMESTAMPTZ,
  result_opened_at TIMESTAMPTZ,
  result_acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

- `completed_at` is the canonical timestamp that the first-AI guided UI is complete. The migration backfills this for profiles that existed before first-AI onboarding launch so mature accounts do not receive new first-run prompts.
- `dismissed_at` means the user permanently hid the flow.
- `hh_oauth_error_at` means HH.ru OAuth failed after the user chose HH path, so retry/manual fallback should remain visible.
- `hh_started_at` is the current first-AI HH attempt watermark. HH sync errors and completed-empty sync timestamps older than this value must not drive onboarding copy.
- `result_opened_at` means the user opened an accessible completed result; this is the activation event.
- `result_acknowledged_at` means the user clicked `Понятно`; the same action also writes `completed_at`.
- The existing `profiles.onboarding_completed` remains scoped to the welcome dialog.

#### 3. **vacancies**
```sql
CREATE TABLE vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT[] NOT NULL,
  responsibilities TEXT[] NOT NULL,
  salary_min BIGINT,
  salary_max BIGINT,
  salary_currency TEXT DEFAULT 'RUB',
  location TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (
    employment_type IN ('full-time', 'part-time', 'contract', 'internship')
  ),
  experience_level TEXT NOT NULL CHECK (
    experience_level IN ('trainee', 'junior', 'middle', 'senior', 'lead')
  ),
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'active', 'paused', 'closed')
  ) DEFAULT 'draft',
  employment_form TEXT CHECK (
    employment_form IN ('tk', 'gph', 'self-employed', 'ip', 'other')
  ), -- legacy single-value field kept for rollout compatibility
  employment_forms TEXT[] NOT NULL DEFAULT '{}' CHECK (
    employment_forms <@ ARRAY['tk', 'gph', 'self-employed', 'ip', 'other']
  ),
  company_id UUID REFERENCES companies(id) NOT NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  hhru_vacancy_id TEXT,
  hh_source_fingerprint TEXT, -- Fingerprint of persisted HH-derived vacancy fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_vacancies_company ON vacancies(company_id);
CREATE INDEX idx_vacancies_status ON vacancies(status);
CREATE INDEX idx_vacancies_created_by ON vacancies(created_by);
```

#### 4. **candidates**
```sql
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  vacancy_id UUID REFERENCES vacancies(id) NOT NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  
  -- Resume storage
  resume_url TEXT, -- Storage pointer to resume file (e.g., "resumes/companies/{company_id}/candidates/{candidate_id}/resumes/{request_hash}.pdf|doc|docx|txt")
  resume_text TEXT, -- Extracted text from file (PDF/DOC/DOCX/TXT) or manually entered description
  resume_file_name TEXT, -- Original file name for display
  resume_file_size INTEGER, -- File size in bytes
  desired_salary_text TEXT CHECK (desired_salary_text IS NULL OR char_length(desired_salary_text) <= 160),
  desired_salary_amount BIGINT CHECK (desired_salary_amount IS NULL OR (desired_salary_amount >= 0 AND desired_salary_amount <= 999999999999999)),
  desired_salary_currency TEXT CHECK (desired_salary_currency IS NULL OR char_length(desired_salary_currency) <= 12),
  desired_salary_source TEXT CHECK (desired_salary_source IS NULL OR desired_salary_source IN ('hh', 'ai_parser', 'regex')),
  CONSTRAINT candidates_desired_salary_displayable CHECK (
    (
      desired_salary_text IS NULL
      AND desired_salary_amount IS NULL
      AND desired_salary_currency IS NULL
      AND desired_salary_source IS NULL
    )
    OR (NULLIF(BTRIM(desired_salary_text), '') IS NOT NULL AND desired_salary_source IS NOT NULL)
  ),
  
  avatar_url TEXT,
  
  -- AI Analysis Results
  ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100), -- legacy (deprecated; больше не заполняется, удалим миграцией)
  match_percentage INTEGER CHECK (match_percentage >= 0 AND match_percentage <= 100),
  
  -- Status tracking
  status TEXT NOT NULL CHECK (
    status IN ('new', 'reviewing', 'security-check', 'interview-scheduled', 'interviewed', 'offer', 'hired', 'rejected')
  ) DEFAULT 'new',
  source TEXT NOT NULL CHECK (
    source IN ('hh.ru', 'manual', 'referral', 'other')
  ) DEFAULT 'manual',
  -- 'manual' = uploaded via UI (PDF/DOC/DOCX/TXT or text)
  -- 'hh.ru' = imported from HeadHunter
  -- 'referral' = referred by employee
  -- 'other' = other sources
  
  -- Notes and comments
  comment TEXT, -- HR notes about the candidate (max 500 chars recommended for UI)
  
  -- Metadata
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  hhru_resume_id TEXT, -- For HH.ru integration
  hh_auto_survey_text TEXT CHECK (char_length(hh_auto_survey_text) <= 4000), -- Latest HH chat bot auto-survey snapshot
  hh_source_fingerprint TEXT, -- Fingerprint of persisted HH-derived candidate fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_candidates_vacancy ON candidates(vacancy_id);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_candidates_ai_score ON candidates(ai_score); -- legacy (deprecated; удалим миграцией)
CREATE INDEX idx_candidates_source ON candidates(source);
CREATE INDEX idx_candidates_created_by ON candidates(created_by);

-- Idempotency for HH imports:
-- one HH resume per vacancy (prevents duplicates on repeated sync)
CREATE UNIQUE INDEX idx_candidates_unique_hhru_resume_per_vacancy
  ON candidates (vacancy_id, hhru_resume_id)
  WHERE hhru_resume_id IS NOT NULL;
```

#### 4.1 **candidate_contacts** (контакты кандидата)

Контакты кандидата вынесены в отдельную таблицу, чтобы поддерживать много каналов общения (email/телефон/Telegram/WhatsApp/ссылки) и редактирование в UI без разрастания `candidates`.

```sql
CREATE TABLE candidate_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- например: email, phone, telegram, whatsapp, linkedin, github, website, other
  value TEXT NOT NULL,         -- значение контакта
  label TEXT,                  -- опционально: \"личный\", \"рабочий\"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_candidate_contacts_candidate_id ON candidate_contacts(candidate_id);
CREATE INDEX idx_candidate_contacts_type ON candidate_contacts(type);
```

**RLS (важно):**
- Доступ к `candidate_contacts` ограничен по компании через `private.candidate_belongs_to_current_company(candidate_id)`.

**Notes:**
- При добавлении кандидата через UI (PDF/DOC/DOCX/TXT или текст) приложение делает best-effort парсинг контактов из `resume_text` и сохраняет их в `candidate_contacts`.
- В интерфейсе контакты можно добавлять/редактировать/удалять и использовать быстрые действия (copy/open).
- Колонки `candidates.email` и `candidates.phone` удалены: контакты храним только в `candidate_contacts`.

**Notes on AI fields (важно для UX):**

- `match_percentage` может быть `NULL`, пока AI job в статусе `queued/processing` или пока идёт финализация результата.
- В интерфейсе отображаем только `match_percentage` как единый показатель “соответствия вакансии”.

**Notes on Resume Storage:**

- `resume_url`: Points to resume file in Supabase Storage bucket `resumes/` (PDF/DOC/DOCX/TXT)
  - Format: `resumes/companies/{company_id}/candidates/{candidate_id}/resumes/{request_hash}.{ext}`
  - Storage object keys are technical ASCII keys and do not include the user's original filename
  - The original filename is stored separately in `resume_file_name` and returned in the download response
  - Access goes through the server download endpoint after candidate/company access checks
  - 5MB file size limit enforced at bucket level

- `resume_text`: Extracted text content
  - For file uploads (PDF/DOC/DOCX/TXT): populated **server-side** in `app/api/candidates` by extracting text from the uploaded file
  - For text input: contains user-entered description
  - Used for AI analysis and search functionality

- `desired_salary_text` / `desired_salary_amount` / `desired_salary_currency` / `desired_salary_source`: structured desired salary captured from a resume or HH resume salary
  - UI candidate cards/details read these fields directly and do not parse `resume_text` client-side
  - `desired_salary_text` is the display value (max 160 chars); if it is absent, the whole desired salary group must stay empty
  - `desired_salary_amount` is optional numeric amount, non-negative, max `999999999999999`
  - `desired_salary_currency` is optional normalized currency; HH `RUR` is stored as `RUB`, supported salary comparison currencies are `RUB/USD/EUR/KZT`
  - `desired_salary_source` is `hh`, `ai_parser`, or `regex`; if source or display text is missing, all desired salary fields are cleared
  - HH sync clears these fields when HH returns `salary: null`; missing or malformed HH salary does not overwrite an existing value

- `source` field values:
  - `manual`: Uploaded through UI (AddCandidateDialog)
  - `hh.ru`: Imported from HeadHunter API
  - `referral`: Employee referral
  - `other`: Other recruitment sources
- `hh_auto_survey_text`: latest text snapshot from HH `chat_bot.auto_survey.text` (if present)
  - imported only for `source='hh.ru'`
  - read-only in candidate card
  - max 4000 chars (trimmed/clamped during sync)
- `hh_source_fingerprint`: SHA-256 fingerprint of normalized HH-derived fields persisted locally
  - used by worker HH sync to skip unchanged candidates and avoid redundant writes

- `comment`: HR notes and observations about the candidate
  - Editable directly from candidate cards
  - Stored in the `candidates.comment` column
  - Recommended max 500 characters for optimal UI display
  - Used for tracking impressions, concerns, next steps

#### 5. **ai_analyses**
```sql
CREATE TABLE ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) NOT NULL,
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Category scores (stored as JSONB for flexibility)
  category_scores JSONB NOT NULL,
  -- Example structure:
  -- {
  --   "skills": {"score": 95, "feedback": "..."},
  --   "experience": {"score": 90, "feedback": "..."},
  --   ...
  -- }
  
  strengths TEXT[] NOT NULL,
  weaknesses TEXT[] NOT NULL,
  recommendations TEXT[] NOT NULL,
  
  -- Metadata
  ai_provider TEXT NOT NULL,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Billing / analytics signals
  credits_charged INTEGER NOT NULL DEFAULT 1 CHECK (credits_charged >= 0),
  used_ocr BOOLEAN NOT NULL DEFAULT FALSE,
  provider_model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  
  UNIQUE(candidate_id)
);

-- Index
CREATE INDEX idx_ai_analyses_candidate ON ai_analyses(candidate_id);
```

#### 5.1 **jobs_ai** (async AI queue)

Для стабильной работы (10–30+ пользователей) AI анализ выполняется **асинхронно**: UI ставит job в очередь, отдельный worker обрабатывает её и пишет финальный результат в `ai_analyses` + обновляет `candidates.match_percentage`.

- **SQL (новое окружение)**: используйте готовый скрипт [`supabase/sql/ai_jobs.sql`](../supabase/sql/ai_jobs.sql)
- **RPC**:
  - `claim_next_ai_job(worker_id text)` — атомарный “claim” задачи (skip locked)
  - `enqueue_ai_job_with_credit_reserve(...)` — создать job + **резервировать credits** в одной транзакции (при нехватке денег создаётся `failed` job)
  - `ensure_ai_job_reservation(...)` — идемпотентная “достраховка” резерва (воркер перед LLM)
  - `release_ai_job_reservation(...)` — освобождение резерва при `failed/canceled`
  - `finalize_ai_job(...)` — атомарная финализация: запись результата, provider-reported `tokens_in/tokens_out`, обновление кандидата, **capture резерва**, списание credits и `jobs_ai=done`

**Примечание по скорингу (UI):**
- В UI отображается только `candidates.match_percentage` как единый показатель **соответствия вакансии**.
- `candidates.ai_score` — legacy (deprecated), больше не заполняется и подлежит удалению миграцией.

**Как считается `match_percentage`:**
\[match = round(0.35*skills + 0.35*experience + 0.10*education + 0.10*achievements + 0.10*cultural\_fit)\]
где `skills/experience/...` — это `category_scores.*.score`, которые возвращает AI и которые сохраняются в `ai_analyses.category_scores`.

---

## 🧹 TODO (план): удалить legacy `ai_score`

**Почему:** `ai_score` и `match_percentage` дублируют смысл, в продукте оставлен один понятный показатель — “соответствие вакансии”.

**Что нужно будет сделать:**
- Удалить `candidates.ai_score` и индекс `idx_candidates_ai_score`
- Обновить типы Supabase (`lib/supabase/database.types.ts`, `worker/src/database.types.ts`) после миграции

**Текущее состояние (hiiire project db)**:
- всё выше уже применено миграцией **`ai_jobs_queue_v2`**
- при наличии старой версии таблицы она сохранена как `public.jobs_ai_legacy`

**Важно про credits**:
- кредиты **резервируются** при создании job (чтобы нельзя было поставить в очередь больше, чем есть доступно).
- credits списываются **только при успешной финализации** (`jobs_ai.status = 'done'`).
- reserve/capture/release реализованы через `company_credits.reserved` + `credit_reservations` + RPC в `supabase/sql/ai_jobs.sql`.
- списание идемпотентно относительно job: `credit_ledger.reference_type='ai_job'`, `reference_id=job_id` (в SQL добавлен unique index).

#### 5.2 **ai_usage_events** (server-only AI usage accounting)

`public.ai_usage_events` records safe usage metadata for the DeepSeek candidate card prefill parser. It is not a prompt, resume, model response, contact, name, position, provider payload, header, or API key log.

```sql
CREATE TABLE public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 120),
  task TEXT NOT NULL CHECK (task IN ('candidate_profile_parse')),
  provider TEXT NOT NULL CHECK (provider IN ('deepseek')),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  status TEXT NOT NULL CHECK (status IN ('success', 'fallback', 'failed')),
  fallback_reason TEXT CHECK (fallback_reason IS NULL OR char_length(fallback_reason) <= 120),
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
  tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes and access:**
- `idx_ai_usage_events_company_created` on `(company_id, created_at desc)`
- `idx_ai_usage_events_task_created` on `(task, created_at desc)`
- `idx_ai_usage_events_request_id` on `(request_id)`
- RLS is enabled with `ai_usage_events_deny_all` (`using (false) with check (false)`), and `anon`/`authenticated` grants are revoked. Writes go only through the server-side service role helper.

#### 6. **interviews**
```sql
CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  vacancy_id UUID NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  type TEXT NOT NULL CHECK (
    type IN ('phone', 'video', 'in-person', 'technical')
  ),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'completed', 'cancelled')
  ),
  interviewer_ids UUID[] NOT NULL CHECK (cardinality(interviewer_ids) >= 1),
  meeting_url TEXT CHECK (meeting_url IS NULL OR char_length(meeting_url) <= 500),
  location TEXT CHECK (location IS NULL OR char_length(location) <= 250),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  completion_note TEXT CHECK (completion_note IS NULL OR char_length(completion_note) <= 2000),
  cancel_note TEXT CHECK (cancel_note IS NULL OR char_length(cancel_note) <= 2000),
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  external_provider TEXT CHECK (
    external_provider IS NULL OR external_provider IN ('google_calendar')
  ),
  external_event_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'not_connected' CHECK (
    sync_status IN ('not_connected', 'pending', 'synced', 'failed')
  ),
  sync_error TEXT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_interviews_company_scheduled_at ON interviews(company_id, scheduled_at);
CREATE INDEX idx_interviews_candidate_id ON interviews(candidate_id);
CREATE INDEX idx_interviews_vacancy_id ON interviews(vacancy_id);
CREATE INDEX idx_interviews_created_by ON interviews(created_by);
CREATE INDEX idx_interviews_scheduled_at ON interviews(scheduled_at);
CREATE INDEX idx_interviews_interviewer_ids ON interviews USING GIN(interviewer_ids);
```

Значения `type`: `phone`, `video`, `in-person`, `technical`.
Значения `status`: `scheduled`, `completed`, `cancelled`.
Значения `sync_status`: `not_connected`, `pending`, `synced`, `failed`.

Google Calendar поля (`external_provider`, `external_event_id`, `sync_status`, `sync_error`, `last_synced_at`) зарезервированы для следующего релиза. В MVP приложение не создаёт и не обновляет внешние события.

**RLS и доступ:**
- `interviews_select_manageable` разрешает direct table select только внутри компании.
- `admin` видит все собеседования своей компании.
- `hr` и `recruiter` получают direct table rows только когда у них есть доступ и к кандидату, и к вакансии.
- Ограниченная interviewer-only видимость отдаётся только через sanitized API DTO календаря: показывает display-имя кандидата, display-название вакансии, время, тип, `meetingUrl` и `location`, но не отдаёт `candidate_id`, `vacancy_id`, `notes`, `created_by`, sync/provider поля и ссылки для открытия карточек кандидата или вакансии.
- Realtime-инвалидация календаря отправляет generic `calendar_changed` по компании при изменениях `interviews`, а также при обновлении имени кандидата или названия вакансии, если они участвуют в собеседованиях.

**Mutations и RPC:**
- Browser-клиентам не выдаются direct `INSERT`, `UPDATE` или `DELETE` policies на `public.interviews`.
- Создание, перенос, отмена и завершение идут через guarded API routes с company/access checks, same-origin guard и service role.
- Создание и редактирование разрешают только вакансии в статусе `active` или `paused`; `draft`/`closed` блокируются до записи.
- Редактирование может менять `candidate_id` и `vacancy_id`, при этом кандидат должен относиться к выбранной вакансии.
- Предупреждения о пересечениях считаются для выбранных интервьюеров и для того же кандидата; сохранение с пересечением требует явного подтверждения.
- Длительность собеседования ограничена диапазоном 5-480 минут на клиенте, API и SQL constraint.
- `create_interview_mvp`, `update_interview_mvp`, `cancel_interview_mvp`, `complete_interview_mvp` объявлены как `security definer` с `search_path = public`.
- `execute` отозван у `public`, `anon`, `authenticated` и выдан только `service_role`.

#### 7. **activities**
```sql
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (
    type IN (
      'vacancy_created', 
      'candidate_added', 
      'interview_scheduled', 
      'candidate_status_changed',
      'ai_analysis_completed'
    )
  ),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('vacancy', 'candidate', 'interview')
  ),
  entity_id UUID NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_activities_user ON activities(user_id);
CREATE INDEX idx_activities_created_at ON activities(created_at DESC);
```

#### 8. **integrations**
#### 9. **integrations_accounts** (HH.ru user-level OAuth)
#### 10. **hiring_targets** (Analytics v1 goals foundation)
```sql
CREATE TABLE hiring_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'company' CHECK (
    scope_type IN ('company', 'department', 'vacancy', 'recruiter')
  ),
  scope_id UUID,
  metric_name TEXT NOT NULL DEFAULT 'hires',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_hires INTEGER CHECK (target_hires IS NULL OR target_hires >= 0),
  target_time_to_fill_days INTEGER CHECK (
    target_time_to_fill_days IS NULL OR target_time_to_fill_days >= 0
  ),
  target_time_to_hire_days INTEGER CHECK (
    target_time_to_hire_days IS NULL OR target_time_to_hire_days >= 0
  ),
  sla_feedback_hours INTEGER CHECK (
    sla_feedback_hours IS NULL OR sla_feedback_hours >= 0
  ),
  minimum_pipeline_size INTEGER CHECK (
    minimum_pipeline_size IS NULL OR minimum_pipeline_size >= 0
  ),
  target_interview_to_offer_conversion NUMERIC(5, 2) CHECK (
    target_interview_to_offer_conversion IS NULL
    OR target_interview_to_offer_conversion BETWEEN 0 AND 100
  ),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX hiring_targets_scope_period_unique
  ON hiring_targets (
    company_id,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    metric_name,
    period_start,
    period_end
  );

CREATE INDEX idx_hiring_targets_company_period
  ON hiring_targets(company_id, period_start, period_end);
```

Analytics v1 keeps legacy `period_type`, `period_key`, and `target` columns nullable if they already exist, and backfills `target_hires` from `target`.

#### 10.1 **pipeline_events** (Analytics v1 candidate movement history)
```sql
CREATE TABLE pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  candidate_id UUID REFERENCES candidates(id) NOT NULL,
  vacancy_id UUID REFERENCES vacancies(id) NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('candidate_created', 'status_changed', 'backfill_initial')
  ),
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  rejection_reason_id UUID REFERENCES rejection_reasons(id),
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

`candidate_created` пишется при создании кандидата через `/api/candidates` и HH import/sync. `status_changed` пишется серверным route `PATCH /api/candidates/:id/status`. `backfill_initial` добавляет базовую точку для старых кандидатов без истории, используя `applied_at` или `created_at`; это не имитирует старые переходы.

Для отказа хранится нормализованный `rejection_reason_id`; `rejection_reason` дублирует человекочитаемое название причины из справочника на момент перехода. Короткий комментарий к отказу, если он есть, хранится в `metadata.rejection_comment`. Если UI не передал причину, `rejection_reason_id` остаётся `NULL`, а аналитика может группировать такие строки как «не указана».

#### 10.2 **rejection_reasons**
```sql
CREATE TABLE rejection_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 10.3 **analytics_filter_views**
```sql
CREATE TABLE analytics_filter_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (
    visibility IN ('private', 'company')
  ),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Private views доступны только владельцу. Company views читают пользователи компании, но создавать, менять и удалять их может только admin.

#### 10.4 **analytics_export_events**
```sql
CREATE TABLE analytics_export_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'recruiter')),
  report_type TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('xlsx', 'csv')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sheets TEXT[] NOT NULL DEFAULT '{}',
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Export audit records include the export format and row counts. Rows are readable only by company admins; inserts are allowed for the current company user so HR/recruiter exports can still be audited.

#### 10.5 **AI audit fields**

Analytics v1 reuses `ai_analyses` and adds audit-safe fields when missing: `model_version`, `prompt_version`, `score_version`, `score_explanation`, `audit_event_id`. These fields are for accountability and exports; raw prompts, CV text, provider payloads, secrets, and internal provider responses are not stored here.

**RLS and grants:**
- All Analytics v1 public tables have RLS enabled.
- `pipeline_events` read follows company scope and existing `private.can_access_candidate` / `private.can_access_vacancy` helpers.
- `analytics_export_events` read is admin-only.
- `hiring_targets` and `rejection_reasons` mutations are admin-only via command-specific insert/update/delete policies.
- Foreign-key columns introduced for Analytics v1 have dedicated indexes for Supabase advisor hygiene: `pipeline_events.actor_id`, `analytics_export_events.user_id`, and `analytics_filter_views.owner_id`.
- Public table grants are explicit for `authenticated`; no `anon` grants are added.

```sql
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  provider TEXT NOT NULL CHECK (
    provider IN ('hh.ru', 'google_calendar', 'slack')
  ),
  is_active BOOLEAN DEFAULT FALSE,
  access_token TEXT, -- Encrypted
  refresh_token TEXT, -- Encrypted
  token_expires_at TIMESTAMP WITH TIME ZONE,
  settings JSONB,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(company_id, provider)
);
```

`integrations` — company-level задел под будущие интеграции. Для HH.ru сейчас используется user-level таблица `integrations_accounts` (см. ниже), чтобы сохранялась ролевая модель видимости (recruiter видит только свои вакансии/кандидатов).

```sql
-- User-level HH.ru integration accounts (OAuth работодателя)
CREATE TABLE integrations_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('hh.ru')),
  is_active BOOLEAN DEFAULT FALSE,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  settings JSONB,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_started_at TIMESTAMP WITH TIME ZONE,
  sync_lock_expires_at TIMESTAMP WITH TIME ZONE,
  last_sync_error TEXT,
  last_sync_error_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, provider)
);

CREATE INDEX idx_integrations_accounts_company_id ON integrations_accounts(company_id);
CREATE INDEX idx_integrations_accounts_user_id ON integrations_accounts(user_id);
CREATE INDEX idx_integrations_accounts_provider ON integrations_accounts(provider);
CREATE INDEX idx_integrations_accounts_hh_due
  ON integrations_accounts(provider, is_active, last_synced_at, sync_lock_expires_at)
  WHERE provider = 'hh.ru' AND is_active = TRUE;
```

`integrations_accounts.settings` (JSONB) хранит минимум:
- `host` (обычно `hh.ru`)
- `employer_id` (HH employer id)
- `manager_id` (HH manager id)

Дополнительные поля HH sync lease/observability:
- `sync_started_at` — когда воркер начал текущий sync
- `sync_lock_expires_at` — TTL lease для безопасного multi-worker claim
- `last_sync_error` / `last_sync_error_at` — последняя ошибка фонового HH sync

RPC для безопасного claim due HH integration:

```sql
create or replace function public.claim_due_hh_integration(
  worker_id text,
  cutoff timestamptz,
  lease_seconds integer default 900
)
returns public.integrations_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.integrations_accounts;
  ttl interval := make_interval(secs => greatest(30, coalesce(lease_seconds, 900)));
begin
  update public.integrations_accounts ia
  set
    sync_started_at = now(),
    sync_lock_expires_at = now() + ttl,
    updated_at = now()
  where ia.id = (
    select id
    from public.integrations_accounts
    where provider = 'hh.ru'
      and is_active = true
      and (last_synced_at is null or last_synced_at <= cutoff)
      and (sync_lock_expires_at is null or sync_lock_expires_at < now())
    order by
      coalesce(last_synced_at, to_timestamp(0)) asc,
      updated_at asc
    for update skip locked
    limit 1
  )
  returning * into claimed;

  return claimed;
end;
$$;
```

#### 11. **feedback** (product feedback from the UI)

Используется для продуктовой обратной связи из `/dashboard/feedback` в пути **«Поделиться идеей»**. Обращения из пути **«Что-то не работает»** уходят в Omnidesk через виджет поддержки и не сохраняются в таблицу `feedback`.

Финальная схема появляется после двухфазного rollout:
- `supabase/sql/product_feedback_v1_additive.sql`: добавляет новые поля совместимо со старым приложением.
- `supabase/sql/product_feedback_v2_finalize.sql`: удаляет legacy `page` после проверки нового деплоя.

Key fields:
- `type`: `idea`, `missing_feature`, `usability`, `question`, `other`
- `sections`: массив разделов (`dashboard`, `vacancies`, `candidates`, `calendar`, `stats`, `settings`, `hr_assistant`, `ai_analysis`, `billing`, `other`)
- `message`: текст обращения, 1-10000 символов
- `status`: `new`, `reviewed`, `in_progress`, `closed`, `deferred`
- `admin_class`: `bug`, `feature`, `ux`, `question`, `billing`, `data`, `integration`, `other`
- `author_name`, `author_email`, `author_role`: snapshot автора на момент отправки
- `admin_note`, `external_url`, `reviewed_by`, `reviewed_at`: поля обработки в platform admin
- `ai_summary`, `ai_labels`, `ai_processed_at`: задел под будущую обработку агентом

Indexes:
- `idx_feedback_company_created_at` по компании и дате создания
- `idx_feedback_created_at` по дате создания
- `idx_feedback_status_created_at` по статусу и дате создания
- `idx_feedback_type_created_at` по типу обращения и дате создания
- `idx_feedback_sections_gin` для поиска по разделам

---

### Monetization / Credits (v1)

На старте мы используем упрощение: **`user = company`** (1 аккаунт = 1 компания). Это снижает сложность онбординга и биллинга. При переходе к multi-user/teams модель расширяется, но текущая схема уже хранит `company_id` и `role` в `profiles`.

#### **platform_admins** (service-wide admin)

Используется для админки сервиса: видеть всех пользователей/компании, управлять credits, смотреть продуктовые метрики.

```sql
CREATE TABLE platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### **company_credits** (balance)

```sql
CREATE TABLE company_credits (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  -- Credits reserved for in-flight async work (prevents queue overbooking).
  -- Available credits in UI: (balance - reserved).
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= balance),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### **credit_ledger** (append-only ledger)

Ledger — единственный “источник истины”, баланс обновляется триггером на
INSERT. В self-hosted production этот контракт восстанавливает миграция
`credit_ledger_balance_trigger`: она также пересчитывает материализованный
баланс для ledger-строк, созданных до появления триггера. Update/Delete
запрещены (append-only).

```sql
CREATE TABLE credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL, -- + начисление, - списание
  reason TEXT NOT NULL CHECK (reason IN ('grant','manual_adjustment','resume_analysis','refund')),
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### **credit_topup_payments** (one-time credit purchases)

Одноразовые Robokassa-платежи для докупки credits без смены тарифа. Успешный webhook начисляет credits в общий `credit_ledger`, поэтому докупленные и пакетные credits не разделяются в балансе.

```sql
CREATE TABLE credit_topup_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL CHECK (credits >= 1 AND credits <= 99999),
  amount INTEGER NOT NULL CHECK (amount = credits * 1500),
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed','refunded','requires_review')),
  provider TEXT NOT NULL DEFAULT 'robokassa',
  provider_id TEXT,
  fiscal_receipt JSONB,
  provider_payload JSONB,
  inv_id INTEGER NOT NULL DEFAULT nextval('public.payments_inv_id_seq'),
  checkout_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  fail_reason TEXT
);
```

Top-up checkout переиспользует matching pending payment только 15 минут и только при совпадении company/credits/amount/currency. Get-or-create выполняет `public.create_or_reuse_credit_topup_payment(...)` под advisory lock, чтобы два параллельных клика не создали две свежие pending-ссылки. В Robokassa уходит encoded `Receipt` из `fiscal_receipt` и `ExpirationDate`; encoded `Receipt` участвует в `SignatureValue`, callback payload сохраняется в `provider_payload`. Валидная поздняя оплата после `checkout_expires_at` всё равно зачисляется, потому что top-up не меняет тариф и credits не сгорают. `requires_review` используется для mismatch по сумме/id/статусу.

`public.finalize_credit_topup_payment(...)` атомарно переводит top-up в `completed` и вставляет `credit_ledger` строку `reason='grant'`, `reference_type='credit_topup_payment'`. Повторный webhook идемпотентен за счёт unique index по ledger reference.

RLS:
- `credit_topup_payments` закрыта от браузерного `SELECT`, чтобы `provider_payload` и фискальный payload не утекали через Data API.
- Checkout/result/admin сценарии читают записи server-side через `service_role`.

#### **credit_reservations** (reserve/capture/release for async billing)

Используется для схемы **reserve → capture/release**:
- при постановке AI job мы **резервируем** кредиты (чтобы нельзя было поставить в очередь больше, чем доступно)
- при успехе (`jobs_ai=done`) — **capture** (снимаем резерв) и пишем списание в `credit_ledger`
- при `failed/canceled` — **release** (освобождаем резерв)

```sql
CREATE TABLE credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  reference_type TEXT NOT NULL, -- e.g. 'ai_job'
  reference_id UUID NOT NULL,   -- job_id
  status TEXT NOT NULL CHECK (status IN ('reserved','captured','released')) DEFAULT 'reserved',
  reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  captured_at TIMESTAMP WITH TIME ZONE,
  released_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(reference_type, reference_id)
);
```

> Security: таблица `credit_reservations` **не доступна из браузера** (RLS включён + deny-all policy). Работает только через server-side (service_role) и DB RPC.

> Security: клиентские роли не должны менять `company_credits` напрямую. Списание за AI‑анализ делаем **сервер-сайд** (service_role / Edge Function / API route). Ручные корректировки — только platform admin.

---

### Plans / Tariffs + Trial (v1.2)

Starter/Professional работают через self-service billing (`checkout -> webhook -> finalize`). Enterprise разделён на sales leads, authenticated plan-change requests, Enterprise agreements и manual invoices.

SQL для развёртывания:
- `supabase/sql/company_plans_and_tariff_requests.sql`
- `supabase/sql/company_plans_expiry.sql`
- `supabase/sql/trial_and_onboarding.sql`
- `supabase/sql/signup_trial_provisioning.sql`
- `supabase/sql/signup_trial_hardening.sql`
- `supabase/sql/billing_robokassa_v1.sql`
- `supabase/sql/billing_scheduled_downgrade_v1.sql`
- `supabase/sql/billing_paid_scheduled_downgrade_v1.sql`
- `supabase/sql/billing_paid_scheduled_downgrade_hardening_v1.sql`
- `supabase/sql/billing_paid_scheduled_downgrade_production_hardening_v1.sql`
- `supabase/sql/billing_paid_scheduled_downgrade_review_fixes_v1.sql`
- `supabase/sql/billing_paid_scheduled_downgrade_enterprise_supersede_v1.sql`
- `supabase/sql/billing_checkout_pending_immediate_idempotency_v1.sql`
- `supabase/sql/billing_immediate_checkout_lifecycle_v1.sql`
- `supabase/sql/billing_expired_immediate_checkout_finalize_review_v1.sql`
- `supabase/sql/billing_recurring_renewal_idempotency_and_mandate_v1.sql`
- `supabase/sql/billing_recurring_mandate_legacy_backfill_v1.sql`
- `supabase/sql/billing_recurring_root_mandate_invoice_v1.sql`
- `supabase/sql/billing_recurring_root_mandate_invoice_overload_cleanup_v1.sql`
- `supabase/sql/billing_recurring_root_mandate_enterprise_clear_v1.sql`
- `supabase/sql/billing_plan_credit_limits_v1.sql`
- `supabase/sql/leads_enterprise_requests.sql`
- `supabase/sql/enterprise_billing_flow_v1.sql`
- `supabase/sql/enterprise_manual_invoice_inv_id_v1.sql`
- `supabase/sql/enterprise_agreement_activation_rpc_v1.sql`
- `supabase/sql/enterprise_agreement_amendments_and_request_closure_v1.sql`
- `supabase/sql/enterprise_exit_request_and_terminal_requests_v1.sql`
- `supabase/sql/enterprise_exit_company_plan_required_v1.sql`
- `supabase/sql/enterprise_agreement_source_request_unique_v1.sql`
- `supabase/sql/enterprise_activation_source_request_required_v1.sql`
- `supabase/sql/enterprise_request_agreement_lifecycle_guard_v1.sql`
- `supabase/sql/enterprise_activation_paid_invoice_required_v1.sql`
- `supabase/sql/enterprise_pending_activation_and_restore_rpc_v1.sql`
- `supabase/sql/enterprise_restore_blocks_provider_review_invoice_v1.sql`
- `supabase/sql/enterprise_restore_blocks_provider_url_invoice_v1.sql`
- `supabase/sql/enterprise_restore_provider_url_only_guard_v1.sql`
- `supabase/sql/enterprise_current_invoice_cycle_rpc_v1.sql`
- `supabase/sql/enterprise_restore_blocks_paid_review_invoice_v1.sql`
- `supabase/sql/enterprise_restore_current_cycle_guard_v1.sql`
- `supabase/sql/enterprise_request_flow_drawer_guards_v1.sql`
- `supabase/sql/enterprise_exit_current_company_plan_schema_v1.sql`

Billing rollout note: these billing migrations are a hard predeploy requirement for app code that reads plan snapshots, creates checkout links, or toggles auto-renew.
Enterprise billing migrations must be applied through Supabase MCP only after verifying the target project: check the Supabase MCP `project_ref` and local `NEXT_PUBLIC_SUPABASE_URL`, and continue only when both point to the same hiiire project.
Current hiiire project state: `enterprise_billing_flow_v1` was applied through Supabase MCP on 2026-05-03; active Enterprise companies were backfilled into `enterprise_agreements`. `enterprise_manual_invoice_inv_id_v1` was applied through Supabase MCP on 2026-05-04 for manual invoice `InvId` reservation. `enterprise_agreement_activation_rpc_v1` was applied through Supabase MCP on 2026-05-04 for atomic agreement activation/end. `enterprise_agreement_amendments_and_request_closure_v1` was applied through Supabase MCP on 2026-05-13 for Enterprise agreement amendments and request-aware Enterprise exit closure. `enterprise_exit_request_and_terminal_requests_v1` was applied through Supabase MCP on 2026-05-13 for Enterprise exit request enforcement and terminal billing request status protection. `enterprise_exit_company_plan_required_v1` was applied through Supabase MCP on 2026-05-14 so active Enterprise exit also requires an existing `company_plans.current_plan='enterprise'` row. `enterprise_agreement_source_request_unique_v1` was applied through Supabase MCP on 2026-05-27 and adds the DB-level idempotency guard for one draft/pending/active agreement per source request. `enterprise_activation_source_request_required_v1` was applied through Supabase MCP on 2026-05-27 and requires every draft/pending Enterprise activation to have an approved source request. `enterprise_request_agreement_lifecycle_guard_v1` prevents request-close/agreement-create races by locking and validating the source request during draft/pending agreement writes and by blocking approved request closure while an open agreement exists. `enterprise_activation_paid_invoice_required_v1` requires a paid manual invoice before Enterprise activation can switch the company plan. `enterprise_pending_activation_and_restore_rpc_v1` narrows activation to `pending_payment` and adds `restore_enterprise_agreement_draft` as the atomic recovery path for stuck agreements without payable invoices. `enterprise_restore_blocks_provider_review_invoice_v1` blocks restore while a `requires_review` manual invoice still has provider identifiers or a payable provider URL. `enterprise_restore_blocks_provider_url_invoice_v1` blocks restore while any linked manual invoice still has a provider payable URL. `enterprise_restore_provider_url_only_guard_v1` documents the final restore guard semantics: reserved Robokassa `InvId` alone is not payable evidence without provider URL. `enterprise_current_invoice_cycle_rpc_v1` adds the atomic issue-invoice RPC and requires activation to use the newest linked manual invoice. `enterprise_restore_blocks_paid_review_invoice_v1` blocks restore when a linked invoice already has paid webhook review evidence without provider URL. `enterprise_restore_current_cycle_guard_v1` narrows paid/review restore blocking to the newest invoice cycle while keeping provider payable URLs as a global blocker. `enterprise_request_flow_drawer_guards_v1` was applied through Supabase MCP on 2026-05-30 and adds request `updated_at` snapshot guards for Enterprise condition creation and request-aware Enterprise exit. `enterprise_exit_current_company_plan_schema_v1` was applied through Supabase MCP on 2026-05-31 and replays request-versioned Enterprise exit RPC against current `company_plans` columns so admin exit no longer references legacy billing fields.

#### **company_plans** (current plan + trial metadata)

```sql
CREATE TABLE company_plans (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  current_plan TEXT NOT NULL CHECK (
    current_plan IN ('trial','starter','professional','enterprise')
  ) DEFAULT 'starter',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  trial_expires_at TIMESTAMP WITH TIME ZONE,
  intended_plan TEXT CHECK (
    intended_plan IS NULL OR intended_plan IN ('starter','professional','enterprise')
  ),
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  robokassa_inv_id TEXT,
  recurring_mandate_inv_id TEXT,
  auto_renew BOOLEAN DEFAULT TRUE,
  scheduled_plan TEXT CHECK (
    scheduled_plan IS NULL OR scheduled_plan IN ('starter','professional','enterprise')
  ),
  scheduled_plan_effective_at TIMESTAMP WITH TIME ZONE,
  scheduled_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL
);
```

RLS:
- `SELECT` разрешён пользователям компании (`company_id = private.current_user_company_id()`).
- Прямые `INSERT/UPDATE/DELETE` из браузера запрещены (изменения делаются server-side через `service_role`).

Notes:
- По умолчанию `current_plan = 'starter'`.
- `trial` поддерживается на уровне схемы и UI; перевод в trial делается server-side логикой.
- `intended_plan` хранит “рекомендованный” платный план после trial (`starter|professional|enterprise`).
- В self-service signup реально используются `starter|professional`; `enterprise` остаётся отдельным согласовательным потоком.
- `scheduled_plan/scheduled_plan_effective_at` хранят будущий переход на следующий период.
- `scheduled_payment_id` заполняется, когда будущий переход уже оплачен заранее. До даты активации текущий план остаётся активным.
- Оплаченный будущий переход защищён DB-trigger: его нельзя перезаписать обычным schedule или другим future checkout.
- Для поддержки/возвратов есть service-role RPC `public.mark_paid_scheduled_downgrade_requires_review(...)`: она переводит связанный payment в `requires_review` и безопасно очищает future schedule без изменения активного тарифа.

#### **enterprise requests (leads)**

Источник заявок на Enterprise-тариф — `public.leads` из формы `/request-access` (фильтр `requested_plan='enterprise'`).

```sql
ALTER TABLE leads
  ADD COLUMN requested_plan TEXT NOT NULL DEFAULT 'enterprise'
    CHECK (requested_plan IN ('starter','professional','enterprise')),
  ADD COLUMN handled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN handled_at TIMESTAMPTZ,
  ADD COLUMN decision_note TEXT;

CREATE INDEX idx_leads_requested_plan_status_created_at
  ON leads(requested_plan, status, created_at DESC);
```

Workflow:
- `status='new'` — новая заявка;
- `status='contacted'` — в работе;
- `status='qualified' | 'rejected'` — завершённые.
- При квалификации Enterprise lead runtime больше не меняет `company_plans` напрямую. Статус `qualified` фиксирует sales-решение, а подключение компании выполняется в `/admin/billing` через approved `billing_plan_change_requests`, `enterprise_agreements` и activation RPC.

#### **billing_plan_change_requests** (authenticated billing requests)

Заявки от уже авторизованных company admins на изменение тарифа. Это отдельный поток от sales leads: заявка привязана к `company_id`, `requested_by`, текущему тарифу, целевому тарифу и источнику (`landing|settings|admin`).

```sql
CREATE TABLE billing_plan_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  current_plan TEXT NOT NULL CHECK (
    current_plan IN ('trial','starter','professional','enterprise')
  ),
  target_plan TEXT NOT NULL CHECK (
    target_plan IN ('starter','professional','enterprise')
  ),
  request_kind TEXT NOT NULL CHECK (
    request_kind IN ('upgrade_to_enterprise','enterprise_exit','enterprise_terms_change','manual_plan_change')
  ),
  source TEXT NOT NULL CHECK (source IN ('landing','settings','admin')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted','in_review','contacted','approved','applied','rejected','canceled')
  ),
  user_message TEXT,
  admin_note TEXT,
  public_response TEXT,
  handled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_billing_plan_change_requests_one_active_per_company
  ON billing_plan_change_requests(company_id)
  WHERE status IN ('submitted','in_review','contacted','approved');
```

Ограничения/индексы:
- В работе может быть только одна plan-change request на компанию. Активные статусы: `submitted`, `in_review`, `contacted`, `approved`.
- Завершённые статусы: `applied`, `rejected`, `canceled`; после них компания может создать новую заявку.
- `idx_billing_plan_change_requests_status_created_at` поддерживает админский список заявок.

RLS:
- RLS включён.
- Runtime writes выполняются server-side. Browser policies добавляются отдельным шагом вместе с API/UX.

#### **enterprise_agreements** (Enterprise terms)

Договорённость с компанией по Enterprise-доступу. `enterprise_agreements` хранит условия, даты действия, лимит credits при необходимости и ссылку на исходную billing request.

```sql
CREATE TABLE enterprise_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_request_id UUID REFERENCES billing_plan_change_requests(id) ON DELETE SET NULL,
  replaces_agreement_id UUID REFERENCES enterprise_agreements(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft','pending_payment','active','ended','canceled')
  ),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  is_open_ended BOOLEAN NOT NULL DEFAULT FALSE,
  credits_limit INTEGER CHECK (credits_limit IS NULL OR credits_limit >= 0),
  terms_summary TEXT,
  internal_note TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  activated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  ended_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ended_by_request_id UUID REFERENCES billing_plan_change_requests(id) ON DELETE SET NULL,
  ended_at TIMESTAMPTZ,
  ended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (is_open_ended = TRUE OR ends_at IS NOT NULL)
);

CREATE UNIQUE INDEX idx_enterprise_agreements_one_active_per_company
  ON enterprise_agreements(company_id)
  WHERE status = 'active';

CREATE INDEX idx_enterprise_agreements_replaces_agreement_id
  ON enterprise_agreements(replaces_agreement_id)
  WHERE replaces_agreement_id IS NOT NULL;
```

Ограничения/индексы:
- У компании может быть только один active Enterprise agreement.
- `idx_enterprise_agreements_company_created_at` поддерживает историю agreements по компании.
- `replaces_agreement_id` связывает amendment с предыдущей active agreement. Изменение условий Enterprise создаёт новую строку и не затирает старые условия.
- `ended_by_request_id` хранит `enterprise_exit` request, который завершил agreement; `source_request_id` остаётся ссылкой на заявку, создавшую или изменившую условия agreement.
- Runtime-создание agreement требует approved `source_request_id`, соответствующий `request_kind` (`upgrade_to_enterprise` для новой agreement, `enterprise_terms_change` для amendment) и блокирует повторное создание draft/pending/active agreement по той же заявке.
- `idx_enterprise_agreements_one_open_per_source_request` защищает тот же контракт на уровне БД, чтобы два конкурентных POST не могли создать два draft/pending/active agreement из одной approved заявки.
- Draft/pending agreement без `source_request_id` нельзя выставить в manual invoice или активировать через RPC; legacy orphan-записи нужно сначала привязать к approved billing request или закрыть вручную.
- DB trigger `trg_enterprise_agreements_source_request_open` блокирует draft/pending agreement insert/status update, если linked source request уже не `approved`. Обновлённый trigger `trg_billing_plan_change_requests_terminal_reopen` блокирует `approved -> rejected|canceled`, когда по заявке уже есть draft/pending/active agreement.
- `draft` описывает подготовку условий и выставление счёта; `pending_payment` ожидает manual invoice payment и допускает activation только после paid invoice; `active` даёт текущий Enterprise-доступ; `ended` и `canceled` закрывают agreement.
- Backfill в `enterprise_billing_flow_v1.sql` создаёт active agreement для существующих `company_plans.current_plan='enterprise'`, только если в проекте есть profile platform admin через `platform_admins`.

RLS:
- RLS включён.
- Управление agreement выполняется platform-admin API через server-side доступ.

RPC lifecycle:
- `public.create_enterprise_manual_invoice_draft(p_agreement_id, p_actor_id, ...)` атомарно блокирует agreement/company, валидирует linked approved source request, создаёт `draft` manual invoice с зарезервированным Robokassa `InvId` и переводит agreement в `pending_payment`. Robokassa Invoice API вызывается только после успешного RPC.
- `public.activate_enterprise_agreement(p_agreement_id, p_actor_id, p_reason)` атомарно блокирует agreement/company, проверяет `pending_payment`, валидирует даты/лимит/terms, требует paid newest linked manual invoice, проверяет отсутствие другого active agreement, переводит agreement в `active`, переводит `company_plans.current_plan` в `enterprise`, очищает trial/period/Robokassa/recurring/scheduled billing поля, а связанный paid scheduled downgrade payment переводит в `requires_review`.
- Если agreement содержит `replaces_agreement_id`, activation RPC требует `source_request_id`, блокирует предыдущую active agreement той же компании, завершает её с тем же reason и только потом активирует новую строку. Так сохраняется audit trail для изменений Enterprise-условий.
- Activation RPC требует `source_request_id` для любого draft/pending agreement, блокирует эту billing request, проверяет ту же компанию, статус `approved`, `target_plan='enterprise'` и подходящий `request_kind` (`upgrade_to_enterprise` для новой agreement, `enterprise_terms_change` для amendment). Для amendment также требуется `current_plan='enterprise'`. Затем request переводится в `applied` с проверкой ровно одной обновлённой строки; orphan agreement или не-approved request не может быть применён задним числом.
- `public.end_enterprise_agreement(p_agreement_id, p_actor_id, p_reason, p_target_plan, p_request_id, p_source_request_updated_at)` атомарно проверяет active agreement, требует approved `enterprise_exit` request с совпадающим `updated_at` snapshot и существующий `company_plans.current_plan='enterprise'` для выхода из Enterprise в `starter|professional`, завершает agreement, пишет `ended_by_request_id`, переводит `company_plans.current_plan` и `intended_plan` на целевой план, очищает period/Robokassa/recurring/scheduled billing state и переводит заявку в `applied`.
- `public.restore_enterprise_agreement_draft(p_agreement_id)` атомарно блокирует agreement и связанные manual invoices, запрещает restore при любом linked invoice с provider payable URL, а `issued`/`paid` invoice или `provider_status='paid_requires_review'` блокируют restore только когда это newest linked invoice cycle. Так поздний callback на старый invoice не может навсегда заблокировать recovery следующего счёта. Заранее зарезервированный Robokassa `InvId` сам по себе не блокирует restore без provider URL или paid webhook review.
- Без `p_request_id` или без текущего Enterprise company plan active Enterprise exit запрещён на уровне RPC/API.
- Обе RPC объявлены `security definer`; execute отозван у `public/anon/authenticated` и выдан только `service_role`. API routes не делают multi-step writes в `enterprise_agreements`, `billing_plan_change_requests` или `company_plans`, а вызывают RPC и перечитывают agreement для ответа.

#### **billing_manual_invoices** (Enterprise manual invoices)

Manual invoices для Enterprise через Robokassa Invoice API. Это отдельная таблица от `payments`: `payments` остаётся для Starter/Professional self-service checkout, recurring renewals и их webhook/RPC lifecycle.

```sql
CREATE TABLE billing_manual_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_id UUID REFERENCES billing_plan_change_requests(id) ON DELETE SET NULL,
  agreement_id UUID REFERENCES enterprise_agreements(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'robokassa' CHECK (provider IN ('robokassa')),
  provider_invoice_id TEXT DEFAULT nextval('billing_manual_invoice_inv_id_seq')::TEXT,
  provider_invoice_url TEXT,
  provider_status TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  description TEXT NOT NULL,
  payer_email TEXT,
  service_period_start TIMESTAMPTZ,
  service_period_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft','issued','paid','expired','canceled','refunded','requires_review')
  ),
  fiscal_receipt JSONB,
  provider_payload JSONB,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_billing_manual_invoices_provider_invoice_once
  ON billing_manual_invoices(provider, provider_invoice_id)
  WHERE provider_invoice_id IS NOT NULL;
```

Ограничения/индексы:
- `idx_billing_manual_invoices_provider_invoice_once` не даёт записать один Robokassa invoice id дважды.
- `idx_billing_manual_invoices_company_created_at` поддерживает историю Enterprise invoices по компании.
- Manual invoice может ссылаться на billing request и Enterprise agreement, но не заменяет `payments` и не участвует в Starter/Professional recurring checkout.
- `billing_manual_invoice_inv_id_seq` выдаёт high-range `InvId` для Robokassa Invoice API; это значение сохраняется в `provider_invoice_id` до вызова провайдера и используется webhook’ом для связи оплаты с invoice.
- Runtime выставляет Enterprise manual invoice только из `draft` agreement: `create_enterprise_manual_invoice_draft` в одной DB-транзакции создаёт `draft` invoice row с зарезервированным Robokassa `InvId` и переводит agreement в `pending_payment`; только после успешного RPC вызывается Robokassa Invoice API.
- Если newest linked invoice ушёл в `expired`, `canceled`, `refunded` или safe `requires_review` без provider payable URL и без paid webhook review, platform admin может вернуть `pending_payment` agreement в `draft` и выставить новый счёт. Restore блокируется, если любой invoice по agreement содержит provider payable URL; `issued`, `paid` и `provider_status='paid_requires_review'` блокируют restore только для newest invoice cycle.
- Для `requires_review` invoice после provider-created race или неоднозначной оплаты platform admin использует Manual Invoices: подтверждает оплату (`paid`) после ручной проверки у провайдера только для newest linked manual invoice, при provider URL или paid webhook review и только пока agreement всё ещё `pending_payment`. Отклонить review invoice можно только если у него нет provider payable URL и нет paid webhook review по текущему invoice cycle; старый callback-only paid review после re-issue закрывается как `not_applied_manual_review`. Подтверждённый newest invoice открывает activation, безопасно отклонённый invoice открывает restore в `draft`.
- Provider-created invoice можно сверить через Robokassa Invoice API: refresh читает `GetInvoiceInformationList`, переводит `Paid` в `paid`, `Expired` в `expired`, `Notpaid` оставляет как `issued`, а для `expired`/`canceled`/`refunded` очищает `provider_invoice_url`, чтобы restore не завис на уже не оплачиваемой ссылке. `issued` и `requires_review` invoice с provider URL отменяются только через provider-side `DeactivateInvoice`; после успешной деактивации локальная запись получает `canceled`, `provider_status='canceled_provider_deactivated'` и очищенный `provider_invoice_url`.
- Валидный paid callback по invoice в статусе `draft`, `canceled`, `expired`, `refunded` или `requires_review` сохраняет provider payload и переводит запись в `requires_review` (если она ещё не `paid`), затем отвечает Robokassa `OK{InvId}`.

RLS:
- RLS включён.
- Создание, выдача ссылки, refresh/cancel и webhook reconciliation выполняются server-side.

#### **tariff_change_requests** (legacy архив)

Таблица оставлена как архив. Runtime-потоки (billing/settings/admin enterprise queue) её больше не используют.

```sql
CREATE TABLE tariff_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  from_plan TEXT NOT NULL CHECK (from_plan IN ('starter','professional','enterprise')),
  to_plan TEXT NOT NULL CHECK (to_plan IN ('starter','professional','enterprise')),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled')) DEFAULT 'pending',
  message TEXT,
  decision_note TEXT,
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

Ограничения/индексы:
- “Не более одной pending-заявки на компанию” реализовано индексом `idx_tariff_change_requests_company_pending_unique`.

RLS:
- `SELECT` — всем пользователям компании.
- `INSERT` — только company admin/lead для своей компании (`requested_by = auth.uid()`).
- `UPDATE/DELETE` из браузера запрещены (approve/reject делаются server-side).

#### **payments** (billing transactions)

Лог биллинговых транзакций Robokassa (checkout + webhook + recurring + retries).

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('starter','professional','enterprise')),
  amount INTEGER NOT NULL, -- в копейках
  currency TEXT NOT NULL DEFAULT 'RUB',
  inv_id INTEGER NOT NULL UNIQUE CHECK (inv_id > 0 AND inv_id <= 2147483647),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending','completed','failed','refunded','requires_review')
  ),
  provider TEXT NOT NULL DEFAULT 'robokassa',
  provider_id TEXT,
  credits_granted INTEGER,
  checkout_expires_at TIMESTAMP WITH TIME ZONE,
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  parent_inv_id INTEGER,
  activate_auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  recurring_mandate_activated BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_change_kind TEXT,
  scheduled_source_plan TEXT,
  scheduled_source_period_end TIMESTAMP WITH TIME ZONE,
  scheduled_activation_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  fail_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_payments_company_created_at ON payments(company_id, created_at DESC);
CREATE INDEX idx_payments_provider_id ON payments(provider_id);
CREATE UNIQUE INDEX idx_payments_provider_provider_id_unique
  ON payments(provider, provider_id)
  WHERE provider_id IS NOT NULL;

CREATE UNIQUE INDEX idx_payments_pending_immediate_checkout_intent_once
  ON payments(company_id, plan, amount, currency, activate_auto_renew)
  WHERE status='pending'
    AND is_recurring=false
    AND scheduled_change_kind IS NULL
    AND checkout_expires_at IS NOT NULL;

CREATE UNIQUE INDEX idx_payments_recurring_active_period_once
  ON payments(company_id, parent_inv_id, period_start)
  WHERE is_recurring=true
    AND parent_inv_id IS NOT NULL
    AND period_start IS NOT NULL
    AND status IN ('pending','completed','requires_review');
```

`inv_id` выдаётся из sequence `public.payments_inv_id_seq` в диапазоне Robokassa `int4`.

Immediate self-service checkout переиспользует existing pending invoice только если он new-model (`checkout_expires_at` заполнен), ещё не истёк, и совпадает весь intent: company, plan, amount, currency, `activate_auto_renew`, `is_recurring=false`, `scheduled_change_kind is null`. Новые immediate invoices получают TTL 15 минут; runtime добавляет `ExpirationDate` в Robokassa URL, но webhook/RPC всё равно проверяет expiry самостоятельно.

`recurring_mandate_activated=true` ставится для Robokassa invoice, который приложение отправляет как recurring-capable (`Recurring=true`) или создаёт через recurring endpoint. Legacy completed invoices с прежним `activate_auto_renew=true` backfill-ятся как recurring-capable, потому что до отдельного флага именно этот intent использовался для отправки checkout с `Recurring=true`. `company_plans.robokassa_inv_id` хранит последний/текущий invoice периода, а `company_plans.recurring_mandate_inv_id` хранит root invoice первого recurring-capable платежа. Включение auto-renew и cron renewal проверяют root payment с `recurring_mandate_activated=true`; cron использует именно root invoice как Robokassa `PreviousInvoiceID`, не последний child invoice.

`public.expire_pending_immediate_checkouts(...)` переводит только new-model pending immediate invoices с `checkout_expires_at < now()` в `failed` и `fail_reason='EXPIRED'`. Legacy pending invoices без `checkout_expires_at` не меняются автоматически, чтобы не ломать ручную сверку старых Robokassa-ссылок. Если Robokassa позже присылает валидный webhook для такого cleanup-expired immediate invoice, `finalize_robokassa_payment(...)` переводит payment в `requires_review` без изменения `company_plans` и без начисления credits.

Идемпотентность начисления credits по оплате:

```sql
CREATE UNIQUE INDEX idx_credit_ledger_plan_payment_once
  ON credit_ledger(reference_type, reference_id, reason)
  WHERE reason='grant' AND reference_type='plan_payment';
```

`public.finalize_robokassa_payment(...)` выполняет атомарно в одной транзакции:
- перевод `payments` в `completed`;
- обновление `company_plans.current_plan/period_start/period_end/robokassa_inv_id/recurring_mandate_inv_id/auto_renew`;
- для non-scheduled immediate invoices задаёт `period_start=completed_at`, `period_end=completed_at + 1 month`, чтобы поздняя оплата не продавала прошедший период;
- если immediate invoice оплачен после `checkout_expires_at` или уже был помечен cleanup как `failed/EXPIRED`, переводит payment в `requires_review` без изменения `company_plans` и без начисления credits;
- если immediate invoice конфликтует с текущим Enterprise или активным higher plan, переводит payment в `requires_review` без изменения доступа и credits;
- серверный checkout для текущего Enterprise блокирует новые Starter/Professional invoices кодом `ENTERPRISE_CHANGE_REQUIRES_SUPPORT`; DB-guard выше остаётся страховкой для старых или stale Robokassa-ссылок;
- для оплаченного будущего понижения `Professional -> Starter` использует immutable intent из `payments.scheduled_change_kind/scheduled_source_*`, поэтому webhook не зависит от текущего mutable `company_plans.auto_renew`;
- при штатном future downgrade сохраняет `scheduled_payment_id` и не меняет текущий тариф до конца периода;
- если такой future invoice оплачен после окончания текущего периода, переносит `period_start/period_end` на новый месяц от даты оплаты и активирует Starter сразу;
- если к моменту webhook текущий план уже изменён администратором/Enterprise-flow и invoice стал stale, переводит payment в `requires_review` без изменения `company_plans`;
- grant credits в `credit_ledger` (`reason='grant'`, `reference_type='plan_payment'`);
- размер grant для self-service тарифов: Starter — 500 кредитов, Professional — 2 000 кредитов;
- идемпотентный ранний выход при повторном webhook.

`public.activate_due_scheduled_plan_payments(...)` вызывается cron-задачей `/api/cron/billing-renewals` и активирует оплаченные будущие понижения, когда наступает `scheduled_plan_effective_at`. Эта же cron-задача вызывает `public.expire_pending_immediate_checkouts(...)` перед recurring renewal logic.

`public.set_company_plan_auto_renew(...)` атомарно обновляет `company_plans.auto_renew` и `payments.activate_auto_renew` для pending/linked paid scheduled downgrade только если сам future invoice имеет recurring mandate, чтобы будущий Starter не получил неподтверждённое автопродление.

Для включения auto-renew RPC требует completed parent payment с `recurring_mandate_activated=true`; при отключении сохраняет прежнюю логику очистки бесплатного scheduled downgrade и не требует mandate.

Admin Enterprise agreement activation/end uses `public.activate_enterprise_agreement(...)` and `public.end_enterprise_agreement(...)`, so agreement status, linked request state, company plan state, and scheduled downgrade review marker change in one database transaction. `public.qualify_company_enterprise_plan(...)` may still exist in older migrations for compatibility, but current runtime does not call it for lead qualification.

RLS:
- `SELECT` — пользователям своей компании.
- Запись из браузера закрыта (insert policy `with check (false)`, update/delete не разрешены).
- Изменения/запись транзакций выполняются только server-side.

#### **trial_email_usage** (immutable anti-abuse registry)

Реестр email, уже использовавших trial. Используется в `handle_new_user` для race-safe ограничения “один trial на email”.

```sql
CREATE TABLE trial_email_usage (
  email TEXT PRIMARY KEY, -- normalized lower(email)
  first_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  first_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

RLS:
- Таблица закрыта для клиентских ролей (deny-all policies).
- Работа с таблицей идёт только server-side (`service_role`) внутри signup provisioning.

#### **signup_provisioning_audit** (signup observability)

Лёгкий аудит успешного signup provisioning (для операционной диагностики).

```sql
CREATE TABLE signup_provisioning_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  intended_plan TEXT NOT NULL CHECK (intended_plan IN ('starter', 'professional')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signup_provisioning_audit_created_at
  ON signup_provisioning_audit(created_at DESC);
```

RLS:
- Таблица закрыта для клиентских ролей (deny-all policies).
- Заполняется server-side из `handle_new_user`.

#### **Signup provisioning trigger (`auth.users`)**

При создании пользователя в Supabase Auth срабатывает trigger `on_auth_user_created` → функция `public.handle_new_user`, которая:
- если user создан platform admin-ом с `app_metadata.provisioning_mode='company_member'` и `app_metadata.provisioning_source='platform_admin'`, создаёт только `profiles` для существующей `company_id` с указанной `role` (без trial provisioning);
- нормализует входные metadata (`name`, `company_name`, `intended_plan`);
- резервирует email в `trial_email_usage` (anti-abuse, race-safe);
- создаёт `companies` + `profiles` (role=`admin`);
- создаёт/обновляет `company_plans` с `current_plan='trial'`, `trial_expires_at=now()+7 days`;
- гарантирует `company_credits` и начисляет `+50` через `credit_ledger` (`reference_type='trial_signup'`);
- пишет запись в `signup_provisioning_audit` и оставляет `RAISE LOG` для success/fail.

---

### Notifications (Telegram + Email) — user preferences

Уведомления отправляются **server-side** (best-effort) и у каждого пользователя есть opt-out переключатели в `/dashboard/settings → Уведомления`.

#### **telegram_notification_settings**

Хранит флаг “получать Telegram‑уведомления” (даже если связка бота с пользователем остаётся).

```sql
create table if not exists public.telegram_notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  telegram_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS (идея):
- `SELECT/INSERT/UPDATE` — только владелец строки (`user_id = auth.uid()`).
- missing row ⇒ “enabled by default”.

SQL: `supabase/sql/telegram_notification_settings.sql`.

#### **email_notification_settings**

Хранит флаг “получать Email‑уведомления”.

```sql
create table if not exists public.email_notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS (идея):
- `SELECT/INSERT/UPDATE` — только владелец строки (`user_id = auth.uid()`).
- missing row ⇒ “enabled by default”.

SQL: `supabase/sql/email_notification_settings.sql`.

## 🔒 Row Level Security (RLS)

### Enable RLS on all tables
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hiring_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_filter_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_export_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs_ocr ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs_ai ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_plan_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_manual_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_email_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE signup_provisioning_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariff_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_notification_settings ENABLE ROW LEVEL SECURITY;
```

### Example RLS Policies

**Profiles:**
```sql
-- Users can read their own profile
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" 
  ON profiles FOR UPDATE 
  USING (auth.uid() = id);
```

**Vacancies:**
```sql
-- Users can view vacancies in their company
CREATE POLICY "Users can view company vacancies" 
  ON vacancies FOR SELECT 
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can create vacancies for their company
CREATE POLICY "Users can create vacancies" 
  ON vacancies FOR INSERT 
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );
```

## 🔄 Database Functions

### Update `updated_at` timestamp
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vacancies_updated_at BEFORE UPDATE ON vacancies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Create activity on candidate status change
```sql
CREATE OR REPLACE FUNCTION create_candidate_status_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO activities (
      type,
      user_id,
      entity_type,
      entity_id,
      description,
      metadata
    ) VALUES (
      'candidate_status_changed',
      auth.uid(),
      'candidate',
      NEW.id,
      format('Статус кандидата %s изменён на "%s"', NEW.name, NEW.status),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_candidate_status_change
  AFTER UPDATE ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION create_candidate_status_activity();
```

## 💾 Storage Buckets

### Resume Storage

**Create Bucket:**
```sql
-- Create storage bucket for resumes with file size limit and MIME type restrictions
INSERT INTO storage.buckets (
  id, 
  name, 
  public, 
  file_size_limit, 
  allowed_mime_types
) 
VALUES (
  'resumes', 
  'resumes', 
  false,
  5242880, -- 5MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
);
```

**Если bucket уже создан (обновление существующего окружения):**
- примените апдейт настроек (лимит + mime types): [`supabase/sql/resume_bucket_mime_types.sql`](../supabase/sql/resume_bucket_mime_types.sql)
- runtime-настройки bucket MIME types нужно применять только через Supabase MCP после проверки, что MCP подключен к проекту hiiire

**Row Level Security (RLS) Policies:**
```sql
-- IMPORTANT (security):
-- Bucket is private. Access is restricted to files that belong to the user's company.
-- Naming convention: companies/{company_id}/candidates/{candidate_id}/resumes/{request_hash}.{ext} (pdf/doc/docx/txt)
--
-- Implementation uses helper functions in a private schema:
-- - private.try_candidate_id_from_storage_path(name) -> uuid | null
-- - private.candidate_belongs_to_current_company(candidate_id) -> boolean

CREATE POLICY "resumes_select_company"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'resumes' AND
    private.candidate_belongs_to_current_company(
      private.try_candidate_id_from_storage_path(name)
    )
  );

CREATE POLICY "resumes_insert_company"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'resumes' AND
    private.candidate_belongs_to_current_company(
      private.try_candidate_id_from_storage_path(name)
    )
  );

CREATE POLICY "resumes_delete_company"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'resumes' AND
    private.candidate_belongs_to_current_company(
      private.try_candidate_id_from_storage_path(name)
    )
  );
```

**File Naming Convention:**
```
companies/{company_id}/candidates/{candidate_id}/resumes/{request_hash}.pdf
companies/{company_id}/candidates/{candidate_id}/resumes/{request_hash}.doc
companies/{company_id}/candidates/{candidate_id}/resumes/{request_hash}.docx
companies/{company_id}/candidates/{candidate_id}/resumes/{request_hash}.txt

Examples:
- companies/11111111-1111-1111-1111-111111111111/candidates/c1234-5678-90ab-cdef/resumes/4d9678b4d6f53a43d2c15f74a2c7c0de.pdf
- companies/11111111-1111-1111-1111-111111111111/candidates/c5555-6666-7777-8888/resumes/38e1b781c5d69c9453f0b87ff57d4a20.doc
- companies/11111111-1111-1111-1111-111111111111/candidates/c9876-5432-10ab-cdef/resumes/80d7a9523e7c0a6d8ecf6a2fbdbb101e.docx
```

**Usage in Application:**
```typescript
// Upload happens server-side in app/api/candidates after vacancy/company access checks.
const storagePath = `companies/${companyId}/candidates/${candidateId}/resumes/${requestHash}.${ext}`;
await admin.storage.from('resumes').upload(storagePath, file);

// Download goes through GET /api/candidates/resume-download?candidateId=...
// The response uses candidates.resume_file_name for the downloaded filename.

// Delete by stored path when candidate cleanup is implemented.
await admin.storage.from('resumes').remove([storagePath]);
```

## HR Assistant

Schema sources:
- [`supabase/sql/hr_assistant_v1.sql`](../supabase/sql/hr_assistant_v1.sql)
- [`supabase/sql/hr_assistant_v2_policy_performance.sql`](../supabase/sql/hr_assistant_v2_policy_performance.sql)
- [`supabase/sql/hr_assistant_v3_policy_select_helpers.sql`](../supabase/sql/hr_assistant_v3_policy_select_helpers.sql)
- [`supabase/sql/hr_assistant_v4_message_idempotency.sql`](../supabase/sql/hr_assistant_v4_message_idempotency.sql)
- [`supabase/sql/hr_assistant_v5_thread_management.sql`](../supabase/sql/hr_assistant_v5_thread_management.sql)

The HR Assistant persistence layer stores chat history, selected context, proposed tool runs, and audit events. All core tables are scoped by `company_id`:

- `assistant_threads` — assistant conversations with `owner_id`, `visibility`, `client_account_id`, `scope_type`, `scope_id`, `mode`, `archived_at`, and `pinned_at`.
- `assistant_messages` — user, assistant, tool, and system messages linked to a thread.
- `assistant_context_items` — pinned, transient, and retrieved context attached to a thread.
- `assistant_tool_runs` — proposed or executed tool calls, policy decisions, approval status, and previews.
- `assistant_audit_events` — immutable audit trail for assistant side effects and approval-sensitive actions.

Message idempotency:
- User messages sent through the streaming chat route store the UI message id in `assistant_messages.metadata.clientMessageId`.
- `idx_assistant_messages_user_client_message_id_unique` prevents duplicate user messages for the same thread and client message id, including concurrent retries.

Thread management:
- `archived_at` hides chats from the default list while keeping them available through archive view and search.
- `pinned_at` sorts pinned chats above regular chats, newest pinned first.
- Trigram indexes on `assistant_threads.title` and `assistant_messages.content` support full chat search by title and message text.

RLS:
- `SELECT` is limited to the user's company via `private.current_user_company_id()`.
- Company-visible threads (`visibility='company'`) are readable by users in that company.
- Private threads are readable only by the thread owner or company admins.
- Message, context, and tool-run reads inherit thread visibility and also verify matching `company_id`.
- Audit events are readable by company admins only.
- Browser writes are blocked for all assistant tables with insert policies using `with check (false)`.
- No browser update/delete policies are created; writes happen server-side only through guarded API/service-role code.
- RLS policies use `(select auth.uid())`, and foreign keys used outside the main query indexes have covering indexes.

## 📈 Useful Queries

### Get candidate analytics
```sql
SELECT 
  v.title as vacancy,
  COUNT(c.id) as total_candidates,
  AVG(c.match_percentage) as avg_match_percentage,
  COUNT(CASE WHEN c.status = 'offer' THEN 1 END) as offers_made
FROM vacancies v
LEFT JOIN candidates c ON v.id = c.vacancy_id
WHERE v.company_id = 'company-uuid'
GROUP BY v.id, v.title;
```

### Get upcoming interviews
```sql
SELECT 
  i.*,
  c.name as candidate_name,
  v.title as vacancy_title
FROM interviews i
JOIN candidates c ON i.candidate_id = c.id
JOIN vacancies v ON i.vacancy_id = v.id
WHERE 
  i.scheduled_at > NOW() AND
  i.status = 'scheduled'
ORDER BY i.scheduled_at ASC;
```

## 🚀 Production Setup Checklist

When preparing a new production environment:

1. Run schema creation scripts
2. Set up RLS policies
3. Create storage buckets
4. Import initial data (if any)
5. Test CRUD operations
6. Verify RLS is working
7. Update frontend to use Supabase client

---

**Last Updated:** May 17, 2026

**Version:** Production Schema v1.5 (HR Assistant persistence draft)
