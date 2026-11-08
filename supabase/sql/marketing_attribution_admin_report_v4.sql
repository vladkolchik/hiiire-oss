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
  p_seen_at timestamptz default now(),
  p_record_event boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_landing_path text := nullif(left(coalesce(p_landing_path, ''), 1000), '');
  v_referrer text := nullif(left(coalesce(p_referrer, ''), 1000), '');
  v_first_utm_source text := nullif(left(coalesce(p_first_utm_source, ''), 200), '');
  v_first_utm_medium text := nullif(left(coalesce(p_first_utm_medium, ''), 200), '');
  v_first_utm_campaign text := nullif(left(coalesce(p_first_utm_campaign, ''), 200), '');
  v_first_utm_term text := nullif(left(coalesce(p_first_utm_term, ''), 200), '');
  v_first_utm_content text := nullif(left(coalesce(p_first_utm_content, ''), 200), '');
  v_first_gclid text := nullif(left(coalesce(p_first_gclid, ''), 200), '');
  v_first_fbclid text := nullif(left(coalesce(p_first_fbclid, ''), 200), '');
  v_first_msclkid text := nullif(left(coalesce(p_first_msclkid, ''), 200), '');
  v_last_utm_source text := nullif(left(coalesce(p_last_utm_source, ''), 200), '');
  v_last_utm_medium text := nullif(left(coalesce(p_last_utm_medium, ''), 200), '');
  v_last_utm_campaign text := nullif(left(coalesce(p_last_utm_campaign, ''), 200), '');
  v_last_utm_term text := nullif(left(coalesce(p_last_utm_term, ''), 200), '');
  v_last_utm_content text := nullif(left(coalesce(p_last_utm_content, ''), 200), '');
  v_last_gclid text := nullif(left(coalesce(p_last_gclid, ''), 200), '');
  v_last_fbclid text := nullif(left(coalesce(p_last_fbclid, ''), 200), '');
  v_last_msclkid text := nullif(left(coalesce(p_last_msclkid, ''), 200), '');
  v_seen_at timestamptz := coalesce(p_seen_at, now());
  v_incoming_first_has_tracking boolean :=
    v_first_utm_source is not null
    or v_first_utm_medium is not null
    or v_first_utm_campaign is not null
    or v_first_utm_term is not null
    or v_first_utm_content is not null
    or v_first_gclid is not null
    or v_first_fbclid is not null
    or v_first_msclkid is not null;
  v_existing_first_is_direct boolean := false;
begin
  select
    first_utm_source is null
    and first_utm_medium is null
    and first_utm_campaign is null
    and first_utm_term is null
    and first_utm_content is null
    and first_gclid is null
    and first_fbclid is null
    and first_msclkid is null
  into v_existing_first_is_direct
  from public.marketing_visitors
  where visitor_id = p_visitor_id;

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
    v_landing_path,
    v_referrer,
    v_first_utm_source,
    v_first_utm_medium,
    v_first_utm_campaign,
    v_first_utm_term,
    v_first_utm_content,
    v_first_gclid,
    v_first_fbclid,
    v_first_msclkid,
    v_last_utm_source,
    v_last_utm_medium,
    v_last_utm_campaign,
    v_last_utm_term,
    v_last_utm_content,
    v_last_gclid,
    v_last_fbclid,
    v_last_msclkid,
    v_seen_at,
    v_seen_at
  )
  on conflict (visitor_id) do update
  set
    landing_path = coalesce(public.marketing_visitors.landing_path, excluded.landing_path),
    referrer = coalesce(public.marketing_visitors.referrer, excluded.referrer),
    first_utm_source = case when v_existing_first_is_direct and v_incoming_first_has_tracking then excluded.first_utm_source else public.marketing_visitors.first_utm_source end,
    first_utm_medium = case when v_existing_first_is_direct and v_incoming_first_has_tracking then excluded.first_utm_medium else public.marketing_visitors.first_utm_medium end,
    first_utm_campaign = case when v_existing_first_is_direct and v_incoming_first_has_tracking then excluded.first_utm_campaign else public.marketing_visitors.first_utm_campaign end,
    first_utm_term = case when v_existing_first_is_direct and v_incoming_first_has_tracking then excluded.first_utm_term else public.marketing_visitors.first_utm_term end,
    first_utm_content = case when v_existing_first_is_direct and v_incoming_first_has_tracking then excluded.first_utm_content else public.marketing_visitors.first_utm_content end,
    first_gclid = case when v_existing_first_is_direct and v_incoming_first_has_tracking then excluded.first_gclid else public.marketing_visitors.first_gclid end,
    first_fbclid = case when v_existing_first_is_direct and v_incoming_first_has_tracking then excluded.first_fbclid else public.marketing_visitors.first_fbclid end,
    first_msclkid = case when v_existing_first_is_direct and v_incoming_first_has_tracking then excluded.first_msclkid else public.marketing_visitors.first_msclkid end,
    last_utm_source = excluded.last_utm_source,
    last_utm_medium = excluded.last_utm_medium,
    last_utm_campaign = excluded.last_utm_campaign,
    last_utm_term = excluded.last_utm_term,
    last_utm_content = excluded.last_utm_content,
    last_gclid = excluded.last_gclid,
    last_fbclid = excluded.last_fbclid,
    last_msclkid = excluded.last_msclkid,
    last_seen_at = excluded.last_seen_at,
    visit_count = public.marketing_visitors.visit_count + case when p_record_event then 1 else 0 end,
    updated_at = now();

  if p_record_event then
    insert into public.marketing_visit_events (
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
      seen_at
    )
    values (
      p_visitor_id,
      v_landing_path,
      v_referrer,
      v_first_utm_source,
      v_first_utm_medium,
      v_first_utm_campaign,
      v_first_utm_term,
      v_first_utm_content,
      v_first_gclid,
      v_first_fbclid,
      v_first_msclkid,
      v_last_utm_source,
      v_last_utm_medium,
      v_last_utm_campaign,
      v_last_utm_term,
      v_last_utm_content,
      v_last_gclid,
      v_last_fbclid,
      v_last_msclkid,
      v_seen_at
    );
  end if;
end;
$$;

revoke all on function public.record_marketing_visit(
  uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.record_marketing_visit(
  uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, timestamptz, boolean
) to service_role;

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
payment_groups as (
  select
    case when c.company_id is null then 'unattributed' else coalesce(nullif(c.first_utm_source, ''), 'direct') end as source,
    case when c.company_id is null then 'none' else coalesce(nullif(c.first_utm_medium, ''), 'none') end as medium,
    case when c.company_id is null then 'not set' else coalesce(nullif(c.first_utm_campaign, ''), 'not set') end as campaign,
    count(p.id)::integer as payments,
    coalesce(sum(p.amount), 0)::bigint as revenue_kopecks
  from public.payments p
  left join first_company_conversion c on c.company_id = p.company_id
  where p.status = 'completed'
    and p.completed_at >= p_start_at
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
    (select count(*)::integer from public.payments where status = 'completed' and completed_at >= p_start_at) as payments,
    (select coalesce(sum(amount), 0)::bigint from public.payments where status = 'completed' and completed_at >= p_start_at) as "revenueKopecks"
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
