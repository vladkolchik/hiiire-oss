-- Enterprise manual invoice Robokassa InvId v1
--
-- Manual Enterprise invoices use their own high-range Robokassa InvId values.
-- This keeps Invoice API callbacks routable by InvId while avoiding collisions
-- with the Starter/Professional payments_inv_id_seq in normal operation.

create sequence if not exists public.billing_manual_invoice_inv_id_seq
  as integer
  start with 1000000000
  increment by 1
  minvalue 1000000000
  maxvalue 2147483647
  cache 1;

alter table public.billing_manual_invoices
  alter column provider_invoice_id set default nextval('public.billing_manual_invoice_inv_id_seq')::text;
