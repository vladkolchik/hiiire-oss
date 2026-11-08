-- Enterprise agreement source request idempotency v1
--
-- Prevents concurrent admin submissions from creating more than one open
-- Enterprise agreement for the same approved billing request.

create unique index if not exists idx_enterprise_agreements_one_open_per_source_request
  on public.enterprise_agreements(source_request_id)
  where source_request_id is not null
    and status in ('draft', 'pending_payment', 'active');
