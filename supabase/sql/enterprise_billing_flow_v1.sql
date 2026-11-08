-- Enterprise billing flow v1
-- Separates authenticated company plan-change requests, Enterprise agreements,
-- and manual invoices from external sales leads and Starter/Professional checkout.

create table if not exists public.billing_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  current_plan text not null check (current_plan in ('trial', 'starter', 'professional', 'enterprise')),
  target_plan text not null check (target_plan in ('starter', 'professional', 'enterprise')),
  request_kind text not null check (
    request_kind in ('upgrade_to_enterprise', 'enterprise_exit', 'enterprise_terms_change', 'manual_plan_change')
  ),
  source text not null check (source in ('landing', 'settings', 'admin')),
  status text not null default 'submitted' check (
    status in ('submitted', 'in_review', 'contacted', 'approved', 'applied', 'rejected', 'canceled')
  ),
  user_message text,
  admin_note text,
  public_response text,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  approved_at timestamptz,
  applied_at timestamptz,
  rejected_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_billing_plan_change_requests_one_active_per_company
  on public.billing_plan_change_requests(company_id)
  where status in ('submitted', 'in_review', 'contacted', 'approved');

create index if not exists idx_billing_plan_change_requests_status_created_at
  on public.billing_plan_change_requests(status, created_at desc);

create table if not exists public.enterprise_agreements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_request_id uuid references public.billing_plan_change_requests(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'pending_payment', 'active', 'ended', 'canceled')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_open_ended boolean not null default false,
  credits_limit integer check (credits_limit is null or credits_limit >= 0),
  terms_summary text,
  internal_note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  activated_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  ended_at timestamptz,
  ended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_open_ended = true or ends_at is not null)
);

create unique index if not exists idx_enterprise_agreements_one_active_per_company
  on public.enterprise_agreements(company_id)
  where status = 'active';

create index if not exists idx_enterprise_agreements_company_created_at
  on public.enterprise_agreements(company_id, created_at desc);

create table if not exists public.billing_manual_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid references public.billing_plan_change_requests(id) on delete set null,
  agreement_id uuid references public.enterprise_agreements(id) on delete set null,
  provider text not null default 'robokassa' check (provider in ('robokassa')),
  provider_invoice_id text,
  provider_invoice_url text,
  provider_status text,
  amount integer not null check (amount > 0),
  currency text not null default 'RUB',
  description text not null,
  payer_email text,
  service_period_start timestamptz,
  service_period_end timestamptz,
  status text not null default 'draft' check (
    status in ('draft', 'issued', 'paid', 'expired', 'canceled', 'refunded', 'requires_review')
  ),
  fiscal_receipt jsonb,
  provider_payload jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_billing_manual_invoices_provider_invoice_once
  on public.billing_manual_invoices(provider, provider_invoice_id)
  where provider_invoice_id is not null;

create index if not exists idx_billing_manual_invoices_company_created_at
  on public.billing_manual_invoices(company_id, created_at desc);

insert into public.enterprise_agreements (
  company_id,
  status,
  starts_at,
  ends_at,
  is_open_ended,
  terms_summary,
  created_by,
  activated_at
)
select
  cp.company_id,
  'active',
  coalesce(cp.updated_at, now()),
  null,
  true,
  'Backfilled active Enterprise access',
  p.id,
  coalesce(cp.updated_at, now())
from public.company_plans cp
join lateral (
  select pr.id
  from public.platform_admins pa
  join public.profiles pr on pr.id = pa.user_id
  order by pa.created_at asc
  limit 1
) p on true
where cp.current_plan = 'enterprise'
  and not exists (
    select 1
    from public.enterprise_agreements ea
    where ea.company_id = cp.company_id
      and ea.status = 'active'
  );

alter table public.billing_plan_change_requests enable row level security;
alter table public.enterprise_agreements enable row level security;
alter table public.billing_manual_invoices enable row level security;
