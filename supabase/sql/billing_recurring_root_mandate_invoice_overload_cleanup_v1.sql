-- Billing recurring root mandate invoice overload cleanup v1
--
-- Keep only the scoped two-argument activate_due_scheduled_plan_payments RPC.
-- The old one-argument overload can make Supabase RPC calls with p_now
-- ambiguous and does not know about recurring_mandate_inv_id.

drop function if exists public.activate_due_scheduled_plan_payments(timestamptz);
