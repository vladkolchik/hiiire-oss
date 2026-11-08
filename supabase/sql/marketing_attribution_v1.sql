create table if not exists public.marketing_visitors (
  visitor_id uuid primary key,
  landing_path text,
  referrer text,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  first_utm_term text,
  first_utm_content text,
  first_gclid text,
  first_fbclid text,
  first_msclkid text,
  last_utm_source text,
  last_utm_medium text,
  last_utm_campaign text,
  last_utm_term text,
  last_utm_content text,
  last_gclid text,
  last_fbclid text,
  last_msclkid text,
  visit_count integer not null default 1 check (visit_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  visitor_id uuid references public.marketing_visitors(visitor_id) on delete set null,
  landing_path text,
  referrer text,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  first_utm_term text,
  first_utm_content text,
  first_gclid text,
  first_fbclid text,
  first_msclkid text,
  last_utm_source text,
  last_utm_medium text,
  last_utm_campaign text,
  last_utm_term text,
  last_utm_content text,
  last_gclid text,
  last_fbclid text,
  last_msclkid text,
  signed_up_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_visitors_first_seen_at
  on public.marketing_visitors (first_seen_at desc);

create index if not exists idx_marketing_visitors_first_source
  on public.marketing_visitors (first_utm_source, first_utm_medium, first_utm_campaign);

create index if not exists idx_marketing_conversions_signed_up_at
  on public.marketing_conversions (signed_up_at desc);

create index if not exists idx_marketing_conversions_company_id
  on public.marketing_conversions (company_id);

create index if not exists idx_marketing_conversions_visitor_id
  on public.marketing_conversions (visitor_id);

create index if not exists idx_marketing_conversions_first_source
  on public.marketing_conversions (first_utm_source, first_utm_medium, first_utm_campaign);

alter table public.marketing_visitors enable row level security;
alter table public.marketing_conversions enable row level security;

drop policy if exists marketing_visitors_deny_all on public.marketing_visitors;
create policy marketing_visitors_deny_all
  on public.marketing_visitors
  for all
  using (false)
  with check (false);

drop policy if exists marketing_conversions_deny_all on public.marketing_conversions;
create policy marketing_conversions_deny_all
  on public.marketing_conversions
  for all
  using (false)
  with check (false);

revoke all on table public.marketing_visitors from anon, authenticated;
revoke all on table public.marketing_conversions from anon, authenticated;

create or replace function public.record_marketing_visit(
  p_visitor_id uuid,
  p_landing_path text,
  p_referrer text,
  p_first_utm_source text,
  p_first_utm_medium text,
  p_first_utm_campaign text,
  p_first_utm_term text,
  p_first_utm_content text,
  p_first_gclid text,
  p_first_fbclid text,
  p_first_msclkid text,
  p_last_utm_source text,
  p_last_utm_medium text,
  p_last_utm_campaign text,
  p_last_utm_term text,
  p_last_utm_content text,
  p_last_gclid text,
  p_last_fbclid text,
  p_last_msclkid text,
  p_seen_at timestamptz default now()
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.marketing_visitors (
    visitor_id,
    landing_path,
    referrer,
    first_utm_source,
    first_utm_medium,
    first_utm_campaign,
    first_utm_term,
    first_utm_content,
    first_gclid,
    first_fbclid,
    first_msclkid,
    last_utm_source,
    last_utm_medium,
    last_utm_campaign,
    last_utm_term,
    last_utm_content,
    last_gclid,
    last_fbclid,
    last_msclkid,
    first_seen_at,
    last_seen_at
  )
  values (
    p_visitor_id,
    nullif(left(coalesce(p_landing_path, ''), 500), ''),
    nullif(left(coalesce(p_referrer, ''), 500), ''),
    nullif(left(coalesce(p_first_utm_source, ''), 200), ''),
    nullif(left(coalesce(p_first_utm_medium, ''), 200), ''),
    nullif(left(coalesce(p_first_utm_campaign, ''), 200), ''),
    nullif(left(coalesce(p_first_utm_term, ''), 200), ''),
    nullif(left(coalesce(p_first_utm_content, ''), 200), ''),
    nullif(left(coalesce(p_first_gclid, ''), 200), ''),
    nullif(left(coalesce(p_first_fbclid, ''), 200), ''),
    nullif(left(coalesce(p_first_msclkid, ''), 200), ''),
    nullif(left(coalesce(p_last_utm_source, ''), 200), ''),
    nullif(left(coalesce(p_last_utm_medium, ''), 200), ''),
    nullif(left(coalesce(p_last_utm_campaign, ''), 200), ''),
    nullif(left(coalesce(p_last_utm_term, ''), 200), ''),
    nullif(left(coalesce(p_last_utm_content, ''), 200), ''),
    nullif(left(coalesce(p_last_gclid, ''), 200), ''),
    nullif(left(coalesce(p_last_fbclid, ''), 200), ''),
    nullif(left(coalesce(p_last_msclkid, ''), 200), ''),
    coalesce(p_seen_at, now()),
    coalesce(p_seen_at, now())
  )
  on conflict (visitor_id) do update set
    last_utm_source = excluded.last_utm_source,
    last_utm_medium = excluded.last_utm_medium,
    last_utm_campaign = excluded.last_utm_campaign,
    last_utm_term = excluded.last_utm_term,
    last_utm_content = excluded.last_utm_content,
    last_gclid = excluded.last_gclid,
    last_fbclid = excluded.last_fbclid,
    last_msclkid = excluded.last_msclkid,
    last_seen_at = excluded.last_seen_at,
    visit_count = public.marketing_visitors.visit_count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.record_marketing_visit(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.record_marketing_visit(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;
