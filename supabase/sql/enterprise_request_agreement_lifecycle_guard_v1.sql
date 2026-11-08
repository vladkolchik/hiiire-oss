-- Enterprise request/agreement lifecycle guard v1
--
-- Closes the race between closing an approved Enterprise billing request and
-- creating or invoicing the draft agreement linked to that request.

create or replace function public.prevent_billing_plan_change_request_terminal_reopen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('applied', 'rejected', 'canceled')
     and new.status <> old.status then
    raise exception 'TERMINAL_REQUEST_STATUS_IMMUTABLE';
  end if;

  if old.status = 'approved'
     and new.status in ('rejected', 'canceled')
     and exists (
       select 1
       from public.enterprise_agreements ea
       where ea.source_request_id = old.id
         and ea.status in ('draft', 'pending_payment', 'active')
     ) then
    raise exception 'SOURCE_REQUEST_HAS_OPEN_AGREEMENT';
  end if;

  return new;
end;
$$;

create or replace function public.validate_enterprise_agreement_source_request_open()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_request public.billing_plan_change_requests;
begin
  if new.status in ('draft', 'pending_payment') then
    if new.source_request_id is null then
      raise exception 'SOURCE_REQUEST_REQUIRED';
    end if;

    select *
      into v_request
    from public.billing_plan_change_requests bpr
    where bpr.id = new.source_request_id
    for update;

    if not found then
      raise exception 'SOURCE_REQUEST_NOT_FOUND';
    end if;

    if v_request.company_id <> new.company_id then
      raise exception 'SOURCE_REQUEST_COMPANY_MISMATCH';
    end if;

    if v_request.status <> 'approved' then
      raise exception 'SOURCE_REQUEST_STATUS_INVALID';
    end if;

    if v_request.target_plan <> 'enterprise' then
      raise exception 'SOURCE_REQUEST_TARGET_PLAN_INVALID';
    end if;

    if new.replaces_agreement_id is null then
      if v_request.request_kind <> 'upgrade_to_enterprise' then
        raise exception 'SOURCE_REQUEST_KIND_INVALID';
      end if;

      if v_request.current_plan = 'enterprise' then
        raise exception 'SOURCE_REQUEST_CURRENT_PLAN_INVALID';
      end if;
    else
      if v_request.request_kind <> 'enterprise_terms_change' then
        raise exception 'SOURCE_REQUEST_KIND_INVALID';
      end if;

      if v_request.current_plan <> 'enterprise' then
        raise exception 'SOURCE_REQUEST_CURRENT_PLAN_INVALID';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enterprise_agreements_source_request_open
  on public.enterprise_agreements;

create trigger trg_enterprise_agreements_source_request_open
  before insert or update of status, source_request_id, company_id, replaces_agreement_id
  on public.enterprise_agreements
  for each row
  execute function public.validate_enterprise_agreement_source_request_open();
