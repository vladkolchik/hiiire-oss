create or replace function public.get_marketing_admin_report(
  p_start_at timestamptz,
  p_recent_limit integer default 50,
  p_source_limit integer default 200
)
returns jsonb
language sql
set search_path = public
as $$
with
report_limits as (
  select greatest(1, least(coalesce(p_source_limit, 200), 500))::integer as source_limit
),
visit_groups as (
  select
    coalesce(nullif(first_utm_source, ''), 'direct') as source,
    coalesce(nullif(first_utm_medium, ''), 'none') as medium,
    coalesce(nullif(first_utm_campaign, ''), 'not set') as campaign,
    count(*)::integer as visits,
    count(distinct visitor_id)::integer as visitors
  from public.marketing_visit_events
  where seen_at >= p_start_at
  group by 1, 2, 3
),
conversion_groups as (
  select
    coalesce(nullif(first_utm_source, ''), 'direct') as source,
    coalesce(nullif(first_utm_medium, ''), 'none') as medium,
    coalesce(nullif(first_utm_campaign, ''), 'not set') as campaign,
    count(*)::integer as signups,
    count(distinct company_id) filter (where company_id is not null)::integer as companies
  from public.marketing_conversions
  where signed_up_at >= p_start_at
  group by 1, 2, 3
),
first_company_conversion as (
  select distinct on (company_id)
    company_id,
    first_utm_source,
    first_utm_medium,
    first_utm_campaign
  from public.marketing_conversions
  where company_id is not null
  order by company_id, signed_up_at asc
),
all_completed_payments as (
  select
    p.id::text as payment_id,
    p.company_id,
    p.amount::bigint as amount,
    p.completed_at
  from public.payments p
  where p.status = 'completed'
    and p.completed_at >= p_start_at
  union all
  select
    ctp.id::text as payment_id,
    ctp.company_id,
    ctp.amount::bigint as amount,
    ctp.completed_at
  from public.credit_topup_payments ctp
  where ctp.status = 'completed'
    and ctp.completed_at >= p_start_at
),
payment_groups as (
  select
    case when c.company_id is null then 'unattributed' else coalesce(nullif(c.first_utm_source, ''), 'direct') end as source,
    case when c.company_id is null then 'none' else coalesce(nullif(c.first_utm_medium, ''), 'none') end as medium,
    case when c.company_id is null then 'not set' else coalesce(nullif(c.first_utm_campaign, ''), 'not set') end as campaign,
    count(ap.payment_id)::integer as payments,
    coalesce(sum(ap.amount), 0)::bigint as revenue_kopecks
  from all_completed_payments ap
  left join first_company_conversion c on c.company_id = ap.company_id
  group by 1, 2, 3
),
source_keys as (
  select source, medium, campaign from visit_groups
  union
  select source, medium, campaign from conversion_groups
  union
  select source, medium, campaign from payment_groups
),
source_rows as (
  select
    concat(k.source, '||', k.medium, '||', k.campaign) as key,
    k.source,
    k.medium,
    k.campaign,
    coalesce(v.visits, 0) as visits,
    coalesce(v.visitors, 0) as visitors,
    coalesce(c.signups, 0) as signups,
    coalesce(c.companies, 0) as companies,
    coalesce(p.payments, 0) as payments,
    coalesce(p.revenue_kopecks, 0) as "revenueKopecks"
  from source_keys k
  left join visit_groups v using (source, medium, campaign)
  left join conversion_groups c using (source, medium, campaign)
  left join payment_groups p using (source, medium, campaign)
),
source_ranked as (
  select
    source_rows.*,
    row_number() over (order by "revenueKopecks" desc, signups desc, visits desc, key asc) as source_rank
  from source_rows
),
source_limited as (
  select key, source, medium, campaign, visits, visitors, signups, companies, payments, "revenueKopecks"
  from source_ranked, report_limits
  where source_rank <= report_limits.source_limit
),
source_other_keys as (
  select source, medium, campaign
  from source_ranked, report_limits
  where source_rank > report_limits.source_limit
),
source_other as (
  select
    'other||mixed||other' as key,
    'other' as source,
    'mixed' as medium,
    'other' as campaign,
    coalesce(sum(sr.visits), 0)::integer as visits,
    (
      select count(distinct visitor_id)::integer
      from public.marketing_visit_events e
      join source_other_keys k
        on k.source = coalesce(nullif(e.first_utm_source, ''), 'direct')
       and k.medium = coalesce(nullif(e.first_utm_medium, ''), 'none')
       and k.campaign = coalesce(nullif(e.first_utm_campaign, ''), 'not set')
      where e.seen_at >= p_start_at
    ) as visitors,
    coalesce(sum(sr.signups), 0)::integer as signups,
    coalesce(sum(sr.companies), 0)::integer as companies,
    coalesce(sum(sr.payments), 0)::integer as payments,
    coalesce(sum(sr."revenueKopecks"), 0)::bigint as "revenueKopecks"
  from source_ranked sr, report_limits
  where sr.source_rank > report_limits.source_limit
  having count(*) > 0
),
source_output as (
  select * from source_limited
  union all
  select * from source_other
),
recent_conversions as (
  select
    mc.user_id as "userId",
    mc.company_id as "companyId",
    mc.signed_up_at as "signedUpAt",
    coalesce(nullif(mc.first_utm_source, ''), 'direct') as source,
    coalesce(nullif(mc.first_utm_medium, ''), 'none') as medium,
    coalesce(nullif(mc.first_utm_campaign, ''), 'not set') as campaign,
    pr.name as "profileName",
    pr.email as "profileEmail",
    co.name as "companyName"
  from public.marketing_conversions mc
  left join public.profiles pr on pr.id = mc.user_id
  left join public.companies co on co.id = mc.company_id
  where mc.signed_up_at >= p_start_at
  order by mc.signed_up_at desc
  limit greatest(0, least(coalesce(p_recent_limit, 50), 200))
),
period_totals as (
  select
    (select count(*)::integer from public.marketing_visit_events where seen_at >= p_start_at) as visits,
    (select count(distinct visitor_id)::integer from public.marketing_visit_events where seen_at >= p_start_at) as visitors,
    (select count(*)::integer from public.marketing_conversions where signed_up_at >= p_start_at) as signups,
    (
      select count(distinct company_id)::integer
      from public.marketing_conversions
      where signed_up_at >= p_start_at and company_id is not null
    ) as companies,
    (select count(*)::integer from all_completed_payments) as payments,
    (select coalesce(sum(amount), 0)::bigint from all_completed_payments) as "revenueKopecks"
)
select jsonb_build_object(
  'totals',
  coalesce(
    (
      select jsonb_build_object(
        'visits', visits,
        'visitors', visitors,
        'signups', signups,
        'companies', companies,
        'payments', payments,
        'revenueKopecks', "revenueKopecks"
      )
      from period_totals
    ),
    jsonb_build_object('visits', 0, 'visitors', 0, 'signups', 0, 'companies', 0, 'payments', 0, 'revenueKopecks', 0)
  ),
  'sources',
  coalesce(
    (
      select jsonb_agg(to_jsonb(source_output) order by "revenueKopecks" desc, signups desc, visits desc, key asc)
      from source_output
    ),
    '[]'::jsonb
  ),
  'recentConversions',
  coalesce(
    (
      select jsonb_agg(to_jsonb(recent_conversions) order by "signedUpAt" desc)
      from recent_conversions
    ),
    '[]'::jsonb
  )
);
$$;

revoke all on function public.get_marketing_admin_report(timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.get_marketing_admin_report(timestamptz, integer, integer) to service_role;
