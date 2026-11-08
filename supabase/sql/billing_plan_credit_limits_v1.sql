-- Billing plan credit limits v1
--
-- Updates the deployed billing RPC grant amounts to the current public
-- tariff limits:
-- - Starter: 500 credits per paid period
-- - Professional: 2000 credits per paid period

do $$
declare
  v_function_definition text;
begin
  select pg_get_functiondef('public.finalize_robokassa_payment(integer, text, timestamptz)'::regprocedure)
    into v_function_definition;

  if v_function_definition is null then
    raise exception 'FINALIZE_ROBOKASSA_PAYMENT_NOT_FOUND';
  end if;

  if position($old$when v_payment.plan = 'starter' then 300$old$ in v_function_definition) > 0 then
    v_function_definition := replace(
      v_function_definition,
      $old$when v_payment.plan = 'starter' then 300$old$,
      $new$when v_payment.plan = 'starter' then 500$new$
    );
  elsif position($new$when v_payment.plan = 'starter' then 500$new$ in v_function_definition) = 0 then
    raise exception 'STARTER_CREDIT_PATTERN_NOT_FOUND_IN_FINALIZE';
  end if;

  if position($old$when v_payment.plan = 'professional' then 1200$old$ in v_function_definition) > 0 then
    v_function_definition := replace(
      v_function_definition,
      $old$when v_payment.plan = 'professional' then 1200$old$,
      $new$when v_payment.plan = 'professional' then 2000$new$
    );
  elsif position($new$when v_payment.plan = 'professional' then 2000$new$ in v_function_definition) = 0 then
    raise exception 'PROFESSIONAL_CREDIT_PATTERN_NOT_FOUND_IN_FINALIZE';
  end if;

  execute v_function_definition;
end;
$$;

revoke all on function public.finalize_robokassa_payment(integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_robokassa_payment(integer, text, timestamptz) to service_role;

do $$
declare
  v_function_definition text;
begin
  select pg_get_functiondef('public.activate_due_scheduled_plan_payments(timestamptz, uuid)'::regprocedure)
    into v_function_definition;

  if v_function_definition is null then
    raise exception 'ACTIVATE_DUE_SCHEDULED_PLAN_PAYMENTS_NOT_FOUND';
  end if;

  if position($old$when v_row.payment_plan = 'starter' then 300$old$ in v_function_definition) > 0 then
    v_function_definition := replace(
      v_function_definition,
      $old$when v_row.payment_plan = 'starter' then 300$old$,
      $new$when v_row.payment_plan = 'starter' then 500$new$
    );
  elsif position($new$when v_row.payment_plan = 'starter' then 500$new$ in v_function_definition) = 0 then
    raise exception 'STARTER_CREDIT_PATTERN_NOT_FOUND_IN_SCHEDULED_ACTIVATION';
  end if;

  if position($old$when v_row.payment_plan = 'professional' then 1200$old$ in v_function_definition) > 0 then
    v_function_definition := replace(
      v_function_definition,
      $old$when v_row.payment_plan = 'professional' then 1200$old$,
      $new$when v_row.payment_plan = 'professional' then 2000$new$
    );
  elsif position($new$when v_row.payment_plan = 'professional' then 2000$new$ in v_function_definition) = 0 then
    raise exception 'PROFESSIONAL_CREDIT_PATTERN_NOT_FOUND_IN_SCHEDULED_ACTIVATION';
  end if;

  execute v_function_definition;
end;
$$;

revoke all on function public.activate_due_scheduled_plan_payments(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.activate_due_scheduled_plan_payments(timestamptz, uuid) to service_role;
