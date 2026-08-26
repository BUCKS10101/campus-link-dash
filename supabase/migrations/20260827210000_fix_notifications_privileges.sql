-- Phase 3C follow-up: fix ineffective notifications privileges.
--
-- CONFIRMED LIVE (2026-08-27) immediately after applying
-- 20260827200000_notifications.sql: has_table_privilege('authenticated',
-- 'notifications', 'INSERT') = true, and the same for 'anon' - despite
-- that migration never granting insert to anyone. Same root cause as
-- 20260825090000_fix_otp_column_privileges.sql: Supabase applies a
-- platform-level `GRANT ALL ON TABLES ... TO anon, authenticated` to
-- every table created in `public`, which a column-level grant alone
-- cannot narrow (table-level grant OR column-level grant = effective
-- access). The additive column-level grants in the previous migration
-- were therefore never sufficient on their own.
--
-- Also confirmed live: both trigger functions were directly EXECUTE-able
-- by anon and authenticated, despite `revoke all on function ... from
-- public`. Supabase similarly appears to grant EXECUTE on functions
-- created in `public` directly to anon/authenticated (not only via the
-- PUBLIC pseudo-role), so revoking from `public` alone does not remove
-- it - each role must be revoked explicitly.
--
-- THE FIX (same documented pattern as the OTP fix):
--   1. Revoke ALL table-level privileges on notifications from anon and
--      authenticated, then re-grant only column-level select + update
--      (read_at) to authenticated. No grant of any kind to anon:
--      notifications_select_own/update_own both require auth.uid(), which
--      an anonymous session can never satisfy, so anon needs nothing.
--   2. Explicitly revoke execute on both trigger functions from anon,
--      authenticated, and public. Neither function is ever meant to be
--      client-callable - they only run implicitly via their trigger,
--      which does not require (and is not affected by removing) any
--      role's EXECUTE grant.
--
-- No data is read, written, or deleted here - GRANT/REVOKE only affect
-- who may attempt an operation. Idempotent; safe to re-run.

revoke all on notifications from anon, authenticated;

grant select (id, recipient_id, type, order_id, read_at, created_at)
  on notifications to authenticated;
grant update (read_at) on notifications to authenticated;

revoke execute on function public.notify_order_status_change()
  from public, anon, authenticated;
revoke execute on function public.notify_new_chat_message()
  from public, anon, authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false for every one of these:
--   select has_table_privilege('anon', 'notifications', 'INSERT');
--   select has_table_privilege('authenticated', 'notifications', 'INSERT');
--   select has_table_privilege('anon', 'notifications', 'SELECT');
--   select has_table_privilege('anon', 'notifications', 'UPDATE');
--   select has_function_privilege('anon', 'notify_order_status_change()', 'EXECUTE');
--   select has_function_privilege('authenticated', 'notify_order_status_change()', 'EXECUTE');
--   select has_function_privilege('anon', 'notify_new_chat_message()', 'EXECUTE');
--   select has_function_privilege('authenticated', 'notify_new_chat_message()', 'EXECUTE');
-- Expect true:
--   select has_column_privilege('authenticated', 'notifications', 'read_at', 'SELECT');
--   select has_column_privilege('authenticated', 'notifications', 'read_at', 'UPDATE');
