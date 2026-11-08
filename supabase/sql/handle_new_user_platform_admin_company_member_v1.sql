-- ============================================================================
-- CANONICAL definition of public.handle_new_user()
-- This is the ONLY file that should define this function.
-- Other migration files (signup_trial_provisioning.sql, signup_trial_hardening.sql)
-- have had their function definitions removed and point here.
-- ============================================================================
--
-- Handle platform-admin user creation for existing company members without
-- triggering trial signup provisioning.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_name text;
  v_company_name text;
  v_intended_plan text;
  v_company_id uuid;
  v_mode text;
  v_source text;
  v_company_id_text text;
  v_role text;
  v_company_exists boolean;
begin
  v_email := lower(trim(coalesce(new.email, '')));
  if v_email = '' then
    raise exception 'SIGNUP_EMAIL_REQUIRED';
  end if;

  v_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
  if v_name is null then
    v_name := split_part(v_email, '@', 1);
  end if;

  -- NOTE: Use raw_user_meta_data, NOT raw_app_meta_data. Supabase does not populate
  -- raw_app_meta_data during INSERT; it's set in a separate UPDATE. user_metadata
  -- is available in the INSERT trigger. See: https://github.com/supabase/auth/issues/975
  v_mode := lower(trim(coalesce(new.raw_user_meta_data ->> 'provisioning_mode', '')));
  v_source := lower(trim(coalesce(new.raw_user_meta_data ->> 'provisioning_source', '')));

  if v_mode = 'company_member' and v_source = 'platform_admin' then
    v_company_id_text := trim(coalesce(new.raw_user_meta_data ->> 'company_id', ''));
    if v_company_id_text = '' then
      raise exception 'INVALID_COMPANY_ID';
    end if;

    begin
      v_company_id := v_company_id_text::uuid;
    exception
      when others then
        raise exception 'INVALID_COMPANY_ID';
    end;

    v_role := lower(trim(coalesce(new.raw_user_meta_data ->> 'role', '')));
    if v_role not in ('admin', 'hr', 'recruiter') then
      raise exception 'INVALID_ROLE';
    end if;

    select exists(select 1 from public.companies c where c.id = v_company_id) into v_company_exists;
    if not v_company_exists then
      raise exception 'COMPANY_NOT_FOUND';
    end if;

    insert into public.profiles (id, email, name, company_id, role)
    values (new.id, v_email, v_name, v_company_id, v_role);

    raise log '[signup_provisioning] platform_admin success user_id=% email=% company_id=% role=%',
      new.id, v_email, v_company_id, v_role;

    return new;
  end if;

  -- Race-safe anti-abuse: reserve email in immutable trial registry.
  begin
    insert into public.trial_email_usage (email, first_user_id, first_used_at)
    values (v_email, new.id, now());
  exception
    when unique_violation then
      raise exception 'TRIAL_ALREADY_USED_FOR_EMAIL';
  end;

  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company_name', '')), '');
  if v_company_name is null then
    v_company_name := 'Новая компания';
  end if;

  v_intended_plan := lower(trim(coalesce(new.raw_user_meta_data ->> 'intended_plan', '')));
  if v_intended_plan not in ('starter', 'professional') then
    v_intended_plan := 'starter';
  end if;

  insert into public.companies (name)
  values (v_company_name)
  returning id into v_company_id;

  insert into public.profiles (id, email, name, company_id, role)
  values (new.id, v_email, v_name, v_company_id, 'admin');

  update public.companies
    set created_by = new.id
  where id = v_company_id
    and created_by is null;

  update public.trial_email_usage
    set company_id = v_company_id
  where email = v_email;

  insert into public.company_plans (
    company_id,
    current_plan,
    trial_expires_at,
    intended_plan,
    period_start,
    period_end,
    auto_renew
  )
  values (
    v_company_id,
    'trial',
    now() + interval '7 days',
    v_intended_plan,
    now(),
    now() + interval '7 days',
    false
  )
  on conflict (company_id) do update
    set current_plan = excluded.current_plan,
        trial_expires_at = excluded.trial_expires_at,
        intended_plan = excluded.intended_plan,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        auto_renew = excluded.auto_renew,
        updated_at = now();

  insert into public.company_credits (company_id, balance, reserved, updated_at)
  values (v_company_id, 0, 0, now())
  on conflict (company_id) do nothing;

  insert into public.credit_ledger (
    company_id,
    delta,
    reason,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  values (
    v_company_id,
    50,
    'grant',
    'trial_signup',
    new.id,
    'Trial signup grant (50 credits)',
    new.id
  )
  on conflict do nothing;

  insert into public.signup_provisioning_audit (
    user_id,
    email,
    company_id,
    intended_plan
  )
  values (
    new.id,
    v_email,
    v_company_id,
    v_intended_plan
  );

  raise log '[signup_provisioning] success user_id=% email=% company_id=% intended_plan=%',
    new.id, v_email, v_company_id, v_intended_plan;

  return new;
exception
  when others then
    raise log '[signup_provisioning] failed user_id=% email=% sqlstate=% error=%',
      new.id, coalesce(v_email, '<null>'), SQLSTATE, SQLERRM;
    raise;
end;
$$;

-- Ensure trigger is wired up (idempotent)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
