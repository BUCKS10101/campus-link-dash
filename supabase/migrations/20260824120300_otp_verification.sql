-- Phase 1B: real, DB-enforced OTP verification for delivery confirmation.
--
-- REWRITTEN after the first apply attempt failed. The live column is
-- orders.otp (varchar), not otp_code, and the participant columns are
-- requester_id/deliverer_id, not customer_id/deliverer_id. Also: the live
-- orders table has NO completed_at and NO updated_at columns at all - the
-- original draft's final UPDATE tried to set both and would have failed
-- this migration a second time even after the column-name fix. Removed.
--
-- Previously `otp` was just another column on `orders`, readable by both
-- participants under orders_select_participant - meaning a deliverer
-- could read the code straight out of the row and "verify" themselves
-- without ever having received it from the requester, which defeats the
-- entire point of an OTP handoff. This migration:
--
--   1. Revokes column-level SELECT on orders.otp from anon/authenticated,
--      so no client can read it directly through the normal REST/select API.
--   2. Adds get_my_order_otp(order_id): lets only the requester read their
--      own order's code (to display/share with the deliverer).
--   3. Adds verify_delivery_otp(order_id, code): lets only the assigned
--      deliverer submit a code; the match check and the resulting
--      'delivered' status transition both happen inside this
--      SECURITY DEFINER function, server-side. The client never compares
--      codes itself - it only ever sees a boolean result.
--
-- STATUS VOCABULARY: 'delivered' as the terminal status value on a
-- successful match - same evidence/caveat as
-- 20260824120100_order_status_integrity.sql (matches database.ts, not
-- confirmed against live data, reviewed and accepted 2026-08-25).
--
-- NOTE: because column-level REVOKE narrows an existing table-level grant,
-- any client query still using `select('*')` (or an implicit `*` after
-- .insert()/.update()) against `orders` will now fail with
-- "permission denied for column otp". The app-layer code (useOrders.ts
-- etc.) was written against the wrong assumed schema in an earlier pass
-- and needs its own follow-up correction independent of this migration -
-- see the Phase 1B schema-mismatch report.
--
-- STATUS: prepared in the repo, NOT verified applied to any live Supabase
-- project by this change.

-- !! INEFFECTIVE - DO NOT RELY ON THIS LINE. !!
-- A column-level REVOKE cannot override the table-level GRANT ALL that
-- Supabase applies to every public table, so this silently does nothing.
-- Confirmed live on 2026-08-25 (anon and authenticated could both still
-- SELECT orders.otp after this migration ran without error).
-- Superseded by 20260825090000_fix_otp_column_privileges.sql, which does
-- it correctly (table-level revoke, then column-level re-grant).
-- Left in place unedited because this migration has already been applied;
-- rewriting applied migrations is worse than superseding them.
revoke select (otp) on orders from anon, authenticated;

create or replace function public.get_my_order_otp(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  select otp into v_code
  from orders
  where id = p_order_id
    and requester_id = auth.uid();

  if not found then
    raise exception 'Order not found or you are not the requester for this order';
  end if;

  return v_code;
end;
$$;

revoke all on function public.get_my_order_otp(uuid) from public;
grant execute on function public.get_my_order_otp(uuid) to authenticated;

create or replace function public.verify_delivery_otp(p_order_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin
  select * into v_order
  from orders
  where id = p_order_id
    and deliverer_id = auth.uid();

  if not found then
    raise exception 'Order not found or you are not the assigned deliverer';
  end if;

  if v_order.status not in ('picked_up', 'out_for_delivery') then
    raise exception 'Order is not ready for delivery confirmation';
  end if;

  if v_order.otp is null or v_order.otp <> p_code then
    return false;
  end if;

  -- Tell the enforce_order_status_transition trigger (see
  -- 20260824120100_order_status_integrity.sql) that this specific UPDATE is
  -- the one legitimate path allowed to set 'delivered'. `true` as the third
  -- argument scopes it to this transaction only.
  perform set_config('campuslink.otp_verified', 'true', true);

  update orders
  set status = 'delivered'
  where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.verify_delivery_otp(uuid, text) from public;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;
