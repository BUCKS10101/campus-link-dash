-- Phase 1B: fix an ineffective OTP column-privilege revoke.
--
-- CONFIRMED LIVE (2026-08-25): a live privilege check showed
-- anon.SELECT(orders.otp) = true and authenticated.SELECT(orders.otp) =
-- true - the column-level revoke in 20260824120300_otp_verification.sql
-- (`revoke select (otp) on orders from anon, authenticated;`) did not
-- actually protect the column, despite running without error. This was
-- also independently observed via a read-only anon-key REST probe: a
-- genuinely nonexistent column correctly errors (42703) at query time
-- regardless of row count, but `?select=id,otp` returned `200 []` - no
-- permission error - proving otp was reachable.
--
-- ROOT CAUSE: Postgres computes effective column access as
-- (table-level grant) OR (column-level grant). A column-level
-- `REVOKE SELECT (otp)` only removes a column-specific ACL entry - it
-- does NOT touch a broader table-level SELECT grant that already covers
-- every column. Supabase projects have `GRANT ALL ON TABLES ... TO anon,
-- authenticated` configured at the platform level for every table in
-- `public` (via ALTER DEFAULT PRIVILEGES, set up automatically at project
-- creation - not something in this repo's migration history, so it can't
-- be seen by reading these files alone). Because `orders` already carries
-- that table-level SELECT grant, the earlier column-level revoke of otp
-- was structurally never going to work, independent of whether that
-- migration applied cleanly.
--
-- THE FIX: the standard, documented Postgres pattern for column-level
-- restriction - revoke the table-level SELECT grant entirely, then
-- explicitly re-grant column-level SELECT on every column EXCEPT otp.
--
-- SCOPE: this migration touches SELECT and UPDATE privileges on `orders`
-- (both narrowed to exclude `otp`), plus re-asserts the two OTP functions'
-- EXECUTE grants. INSERT/DELETE grants and all RLS policies are untouched
-- - this fixes the OTP issue specifically, not a general re-audit.
--
-- UPDATE matters as much as SELECT here. Without the same treatment, a
-- deliverer could bypass the OTP handoff entirely:
--   1. table-level UPDATE still covers otp (a column-level REVOKE UPDATE
--      is defeated by the exact mechanism described above),
--   2. RLS policy orders_update_assigned_deliverer lets the assigned
--      deliverer update their own order row,
--   3. the enforce_order_status_transition trigger only fires
--      `when (old.status is distinct from new.status)`, so an UPDATE
--      touching only otp never trips it.
-- Net effect: `UPDATE orders SET otp='111111' WHERE id=<their order>`
-- followed by verify_delivery_otp(id,'111111') marks the order delivered
-- without the customer ever providing their code. Restricting UPDATE to
-- the two columns the app actually writes closes that hole.
--
-- No data is read, written, or deleted by this migration - GRANT/REVOKE
-- only change who is allowed to attempt an operation, never touch rows.
-- Every statement below is idempotent (Postgres GRANT/REVOKE don't error
-- on re-application), so this file is safe to re-run.
--
-- STATUS: prepared in the repo, NOT applied to any live Supabase project.

-- Remove the table-level SELECT grant that was silently overriding the
-- earlier column-level otp revoke.
revoke select on orders from anon, authenticated;

-- Re-grant SELECT on every column except otp. Keep this list in sync with
-- ORDER_COLUMNS in src/hooks/useOrders.ts - if that list changes, this
-- must change too, or a legitimate query will start failing with
-- "permission denied for column ...".
grant select (
  id, requester_id, deliverer_id, restaurant_name, items, tip_amount,
  delivery_location, status, distance_km, created_at
) on orders to anon, authenticated;

-- Same table-level-then-column-level treatment for UPDATE (see the header
-- for the bypass this prevents). The application only ever updates two
-- columns on orders - acceptOrder() writes deliverer_id + status, and
-- updateOrderStatus() writes status (src/hooks/useOrders.ts) - so those
-- are the only two any client needs.
--
-- anon is intentionally granted nothing here: every orders UPDATE policy
-- requires auth.uid(), so an anonymous client could never satisfy one.
revoke update on orders from anon, authenticated;
grant update (deliverer_id, status) on orders to authenticated;

-- otp: INSERT only. createOrder() generates the 6-digit code client-side
-- at order creation (the column has no DB default), so INSERT is the one
-- direct privilege genuinely required. No SELECT (use get_my_order_otp()),
-- no UPDATE (verify_delivery_otp() is SECURITY DEFINER and bypasses
-- grants for its own writes, so no client ever needs to write otp again).
grant insert (otp) on orders to authenticated;

-- Re-assert the OTP functions' EXECUTE grants (idempotent, harmless if
-- already correct - see this file's header for why this is included
-- defensively rather than assumed fine).
revoke all on function public.get_my_order_otp(uuid) from public;
grant execute on function public.get_my_order_otp(uuid) to authenticated;

revoke all on function public.verify_delivery_otp(uuid, text) from public;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Privileges on otp specifically - expect ONLY authenticated/INSERT,
-- with no SELECT and no UPDATE row present:
--   select grantee, privilege_type from information_schema.column_privileges
--   where table_schema='public' and table_name='orders' and column_name='otp'
--   order by 1,2;
--
-- Table-level grants - expect NO SELECT and NO UPDATE for anon or
-- authenticated (those are now column-scoped instead):
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and table_name='orders' order by 1,2;
--
-- Direct boolean checks:
--   select has_column_privilege('anon','orders','otp','SELECT')          -- expect false
--        , has_column_privilege('authenticated','orders','otp','SELECT') -- expect false
--        , has_column_privilege('authenticated','orders','otp','UPDATE') -- expect false
--        , has_column_privilege('authenticated','orders','otp','INSERT') -- expect true
--        , has_column_privilege('authenticated','orders','status','UPDATE'); -- expect true
