-- Phase 3G correction: once a deliverer has marked an order picked_up,
-- they physically have the item - normal cancellation is no longer a
-- legitimate action for them (no refund/recovery flow exists to make a
-- mid-delivery cancel safe). See PHASE3_3G_DELIVERY_LIFECYCLE_SPEC.md's
-- corrected cancellation matrix.
--
-- The pre-existing orders_update_assigned_deliverer RLS policy
-- (20260824000000_rls_policies_and_indexes.sql) intentionally has no
-- status restriction of its own - it's the same policy that authorizes
-- every legitimate deliverer advance (accepted -> picked_up ->
-- out_for_delivery), and narrowing it would break those. Rather than
-- weakening or duplicating that policy, this migration tightens
-- enforce_order_status_transition() itself (the same trigger 3G already
-- extended for cancelled_at/cancelled_by) with one more actor-aware
-- check: it now refuses a cancellation performed by the assigned
-- deliverer unless the order is still 'accepted'. This applies
-- regardless of which RLS policy let the raw UPDATE through, so it is a
-- real, DB-enforced authorization tightening - not UI hiding.
--
-- The requester-side rule (orders_update_requester_cancel: pending/
-- accepted only) is unchanged and needs no revision - a requester's
-- cancel attempt from picked_up/out_for_delivery is already rejected by
-- that policy's own USING clause before this trigger ever runs.
--
-- STATUS: prepared in the repo. Apply to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  -- 'delivered' may only be set by verify_delivery_otp() (see
  -- 20260824120300_otp_verification.sql), which sets this session-local
  -- flag right before its UPDATE. This blocks a deliverer from marking an
  -- order delivered via a direct UPDATE, even though RLS would otherwise
  -- allow them to update their own assigned order's status.
  if new.status = 'delivered' and coalesce(current_setting('campuslink.otp_verified', true), '') <> 'true' then
    raise exception 'Order can only be marked delivered via OTP verification'
      using errcode = 'insufficient_privilege';
  end if;

  -- Phase 3G correction: the assigned deliverer may only cancel while the
  -- order is still 'accepted' - once it's picked_up (they physically have
  -- the item) or out_for_delivery, cancellation is no longer offered to
  -- them. auth.uid() here is the session that issued this UPDATE, not a
  -- client-supplied value - the same trust boundary the cancelled_at/
  -- cancelled_by stamping below already relies on. This does not affect
  -- the requester's own cancellation (auth.uid() = requester_id, not
  -- deliverer_id, so this branch never fires for them) or any other
  -- deliverer transition (only checked when the target is 'cancelled').
  if new.status = 'cancelled'
     and old.deliverer_id is not null
     and auth.uid() = old.deliverer_id
     and old.status <> 'accepted' then
    raise exception 'A deliverer can only cancel while the order is still accepted, before pickup'
      using errcode = 'insufficient_privilege';
  end if;

  allowed := case old.status
    when 'pending' then array['accepted', 'cancelled']
    when 'accepted' then array['picked_up', 'cancelled']
    when 'picked_up' then array['out_for_delivery', 'cancelled']
    when 'out_for_delivery' then array['delivered', 'cancelled']
    else array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Phase 3G: server-stamped, never client-supplied. auth.uid() here
  -- reflects whichever participant's session issued this UPDATE - the
  -- same trust boundary get_my_order_otp()/verify_delivery_otp() already
  -- rely on for auth.uid()-scoped lookups.
  if new.status = 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  end if;

  return new;
end;
$$;

-- ============ VERIFY AFTER APPLYING ============
-- Manual checks (see spec §14 for the full corrected matrix):
--   deliverer cancel attempt on their own 'accepted' order -> succeeds,
--     unchanged from before this migration.
--   deliverer cancel attempt on their own 'picked_up' order -> rejected
--     with "A deliverer can only cancel while the order is still
--     accepted, before pickup" (was previously allowed - this is the
--     behavior this migration changes).
--   deliverer cancel attempt on their own 'out_for_delivery' order ->
--     rejected, same reason.
--   requester cancel attempts on 'pending'/'accepted' -> unaffected,
--     still succeed (this trigger branch never evaluates true for them).
--   requester cancel attempt on 'picked_up'/'out_for_delivery' -> still
--     rejected, but by the pre-existing orders_update_requester_cancel
--     RLS policy (unchanged), before this trigger even runs.
--   every legitimate deliverer advance (accepted->picked_up,
--     picked_up->out_for_delivery) -> unaffected; this branch only ever
--     evaluates when new.status = 'cancelled'.
