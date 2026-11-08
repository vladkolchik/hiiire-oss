-- Billing checkout pending immediate idempotency v1
--
-- Goals:
-- - Prevent duplicate pending immediate self-service invoices for the same company and plan.
-- - Keep paid scheduled downgrades out of this guard; they have their own period-based protection.
-- - Leave legacy pending duplicates untouched; runtime reuses existing pending invoices.

create unique index if not exists idx_payments_pending_immediate_self_service_once
  on public.payments (company_id, plan)
  where status = 'pending'
    and is_recurring = false
    and scheduled_change_kind is null
    and created_at is not null
    and created_at >= timestamptz '2026-04-29 00:00:00+00';
