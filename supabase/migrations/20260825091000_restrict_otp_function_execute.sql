-- Phase 1B: restrict EXECUTE on the OTP functions to `authenticated` only.
--
-- FOUND DURING STAGING VERIFICATION (2026-08-25): after applying the full
-- chain, has_function_privilege('anon', ...) returned TRUE for BOTH
-- get_my_order_otp and verify_delivery_otp, even though
-- 20260824120300_otp_verification.sql and 20260825090000 both do
-- `revoke all on function ... from public`.
--
-- ROOT CAUSE: the same class of mistake as the otp column bug. Revoking
-- from PUBLIC does not remove a *role's own* explicit grant. Supabase
-- grants EXECUTE on functions in `public` to anon/authenticated/
-- service_role via ALTER DEFAULT PRIVILEGES at project creation, so anon
-- holds its own grant that a PUBLIC-scoped revoke never touches.
--
-- SEVERITY: low - NOT exploitable today. Both functions gate every lookup
-- on auth.uid(), which is NULL for anon, so `where requester_id =
-- auth.uid()` / `where deliverer_id = auth.uid()` never match and the
-- functions raise their own guard exceptions. Verified empirically
-- against staging: anon calls to both return P0001 "Order not found or
-- you are not the requester/assigned deliverer".
--
-- Fixed anyway: an unauthenticated caller has no business invoking these
-- at all, and relying on auth.uid() being NULL is a weaker guarantee than
-- simply not granting EXECUTE. Defence in depth, and it makes the actual
-- privilege state match the documented intent.
--
-- Idempotent and safe to re-run. Touches no data and no other object.
--
-- STATUS: applied to STAGING 2026-08-25. NOT applied to production.

revoke execute on function public.get_my_order_otp(uuid) from anon;
revoke execute on function public.verify_delivery_otp(uuid, text) from anon;

-- Re-assert the intended grants (idempotent).
grant execute on function public.get_my_order_otp(uuid) to authenticated;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('get_my_order_otp', 'verify_delivery_otp');
-- Expect: anon_exec = false, auth_exec = true, for both.
