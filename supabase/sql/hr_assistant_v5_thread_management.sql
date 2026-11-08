create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
alter extension pg_trgm set schema extensions;

alter table public.assistant_threads
  add column if not exists pinned_at timestamptz;

create index if not exists idx_assistant_threads_company_pinned_updated
  on public.assistant_threads(company_id, pinned_at desc nulls last, updated_at desc);

create index if not exists idx_assistant_threads_title_trgm
  on public.assistant_threads using gin (title gin_trgm_ops);

create index if not exists idx_assistant_messages_content_trgm
  on public.assistant_messages using gin (content gin_trgm_ops);
