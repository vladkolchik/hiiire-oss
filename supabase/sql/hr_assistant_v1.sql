create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_account_id uuid,
  scope_type text not null default 'company'
    check (scope_type in ('company', 'vacancy', 'candidate', 'interview', 'support', 'client_account')),
  scope_id uuid,
  mode text not null default 'general'
    check (mode in ('general', 'screening', 'outreach', 'interview', 'pipeline', 'support')),
  title text not null check (char_length(title) between 1 and 160),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  visibility text not null default 'private'
    check (visibility in ('private', 'company')),
  summary text check (summary is null or char_length(summary) <= 4000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text not null check (char_length(content) <= 20000),
  metadata jsonb not null default '{}'::jsonb,
  model text check (model is null or char_length(model) <= 120),
  provider text check (provider is null or char_length(provider) <= 80),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_context_items (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('pinned', 'transient', 'retrieved')),
  entity_type text not null check (char_length(entity_type) between 1 and 64),
  entity_id uuid,
  source_label text not null check (char_length(source_label) between 1 and 240),
  metadata jsonb not null default '{}'::jsonb,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_tool_runs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  message_id uuid references public.assistant_messages(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  input_preview jsonb not null default '{}'::jsonb,
  risk_level text not null check (risk_level in ('read', 'draft', 'ai_cost', 'crm_write', 'external', 'destructive')),
  policy_decision text not null check (
    policy_decision in (
      'auto_approved',
      'manual_approval_required',
      'failed_access_check',
      'failed_credit_check',
      'not_supported_yet',
      'blocked'
    )
  ),
  approval_status text not null default 'not_required'
    check (approval_status in ('not_required', 'pending', 'approved', 'rejected', 'expired')),
  approved_by uuid references public.profiles(id) on delete set null,
  executed_at timestamptz,
  result_preview jsonb not null default '{}'::jsonb,
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  thread_id uuid references public.assistant_threads(id) on delete set null,
  tool_run_id uuid references public.assistant_tool_runs(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 120),
  entity_type text check (entity_type is null or char_length(entity_type) <= 64),
  entity_id uuid,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_threads_company_updated
  on public.assistant_threads(company_id, updated_at desc);
create index if not exists idx_assistant_threads_company_scope
  on public.assistant_threads(company_id, scope_type, scope_id);
create index if not exists idx_assistant_threads_client_account
  on public.assistant_threads(company_id, client_account_id)
  where client_account_id is not null;
create index if not exists idx_assistant_threads_owner
  on public.assistant_threads(owner_id);
create index if not exists idx_assistant_messages_thread_created
  on public.assistant_messages(thread_id, created_at);
create index if not exists idx_assistant_messages_company_created
  on public.assistant_messages(company_id, created_at desc);
create index if not exists idx_assistant_messages_created_by
  on public.assistant_messages(created_by)
  where created_by is not null;
create index if not exists idx_assistant_context_thread
  on public.assistant_context_items(thread_id, kind);
create index if not exists idx_assistant_context_company_entity
  on public.assistant_context_items(company_id, entity_type, entity_id);
create index if not exists idx_assistant_context_added_by
  on public.assistant_context_items(added_by)
  where added_by is not null;
create index if not exists idx_assistant_tool_runs_thread
  on public.assistant_tool_runs(thread_id, created_at desc);
create index if not exists idx_assistant_tool_runs_company_created
  on public.assistant_tool_runs(company_id, created_at desc);
create index if not exists idx_assistant_tool_runs_message
  on public.assistant_tool_runs(message_id)
  where message_id is not null;
create index if not exists idx_assistant_tool_runs_approved_by
  on public.assistant_tool_runs(approved_by)
  where approved_by is not null;
create index if not exists idx_assistant_audit_company_created
  on public.assistant_audit_events(company_id, created_at desc);
create index if not exists idx_assistant_audit_thread
  on public.assistant_audit_events(thread_id)
  where thread_id is not null;
create index if not exists idx_assistant_audit_tool_run
  on public.assistant_audit_events(tool_run_id)
  where tool_run_id is not null;
create index if not exists idx_assistant_audit_actor
  on public.assistant_audit_events(actor_user_id)
  where actor_user_id is not null;

alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_context_items enable row level security;
alter table public.assistant_tool_runs enable row level security;
alter table public.assistant_audit_events enable row level security;

drop policy if exists assistant_threads_select_company on public.assistant_threads;
create policy assistant_threads_select_company
  on public.assistant_threads
  for select
  using (
    company_id = (select private.current_user_company_id())
    and (
      visibility = 'company'
      or owner_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.company_id = assistant_threads.company_id
          and p.role = 'admin'
      )
    )
  );

drop policy if exists assistant_messages_select_company on public.assistant_messages;
create policy assistant_messages_select_company
  on public.assistant_messages
  for select
  using (
    company_id = (select private.current_user_company_id())
    and exists (
      select 1
      from public.assistant_threads t
      where t.id = assistant_messages.thread_id
        and t.company_id = assistant_messages.company_id
        and (
          t.visibility = 'company'
          or t.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.company_id = t.company_id
              and p.role = 'admin'
          )
        )
    )
  );

drop policy if exists assistant_context_select_company on public.assistant_context_items;
create policy assistant_context_select_company
  on public.assistant_context_items
  for select
  using (
    company_id = (select private.current_user_company_id())
    and exists (
      select 1
      from public.assistant_threads t
      where t.id = assistant_context_items.thread_id
        and t.company_id = assistant_context_items.company_id
        and (
          t.visibility = 'company'
          or t.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.company_id = t.company_id
              and p.role = 'admin'
          )
        )
    )
  );

drop policy if exists assistant_tool_runs_select_company on public.assistant_tool_runs;
create policy assistant_tool_runs_select_company
  on public.assistant_tool_runs
  for select
  using (
    company_id = (select private.current_user_company_id())
    and exists (
      select 1
      from public.assistant_threads t
      where t.id = assistant_tool_runs.thread_id
        and t.company_id = assistant_tool_runs.company_id
        and (
          t.visibility = 'company'
          or t.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.company_id = t.company_id
              and p.role = 'admin'
          )
        )
    )
  );

drop policy if exists assistant_audit_select_company_admin on public.assistant_audit_events;
create policy assistant_audit_select_company_admin
  on public.assistant_audit_events
  for select
  using (
    company_id = (select private.current_user_company_id())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.company_id = assistant_audit_events.company_id
        and p.role = 'admin'
    )
  );

-- Assistant writes are performed server-side with service_role after API access checks.
-- Browser clients may read permitted rows only; no update/delete policies are created here.
drop policy if exists assistant_threads_no_browser_insert on public.assistant_threads;
create policy assistant_threads_no_browser_insert
  on public.assistant_threads
  for insert
  with check (false);

drop policy if exists assistant_messages_no_browser_insert on public.assistant_messages;
create policy assistant_messages_no_browser_insert
  on public.assistant_messages
  for insert
  with check (false);

drop policy if exists assistant_context_no_browser_insert on public.assistant_context_items;
create policy assistant_context_no_browser_insert
  on public.assistant_context_items
  for insert
  with check (false);

drop policy if exists assistant_tool_runs_no_browser_insert on public.assistant_tool_runs;
create policy assistant_tool_runs_no_browser_insert
  on public.assistant_tool_runs
  for insert
  with check (false);

drop policy if exists assistant_audit_no_browser_insert on public.assistant_audit_events;
create policy assistant_audit_no_browser_insert
  on public.assistant_audit_events
  for insert
  with check (false);


