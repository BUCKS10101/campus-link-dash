-- Phase 1B: order-status data integrity.
--
-- REWRITTEN after the first apply attempt failed. `orders.status` (varchar,
-- default 'pending') exists on the live table with NO check constraint
-- currently, and `orders` has zero rows as of 2026-08-24 - confirmed via
-- `select status, count(*) from orders group by status;` returning no
-- rows - so there is no existing data this constraint could conflict with.
--
-- STATUS VOCABULARY: the six-value lifecycle below (pending -> accepted ->
-- picked_up -> out_for_delivery -> delivered, cancel from any non-terminal
-- state) can't be confirmed against live data (orders has zero rows), but
-- it does match src/types/database.ts's Row/Insert/Update status union,
-- the one other source in the codebase that asserts a status vocabulary.
-- That file also asserted several columns (price, pickup_location,
-- updated_at, completed_at) that turned out not to exist live, so it's
-- corroborating evidence of intent, not proof of what's enforced anywhere
-- - reviewed and accepted as-is on 2026-08-25. If a future data source
-- contradicts this (e.g. an admin tool writing different status strings),
-- every insert/update using it will fail loudly against this constraint,
-- which is at least safer than silently accepting an unrecognized value.
--
-- STATUS: prepared in the repo, NOT verified applied to any live Supabase
-- project by this change.
--
-- 1. A CHECK constraint so `status` can never hold a value outside the
--    known set, regardless of what a client sends. Guarded with a DO
--    block so re-running this file doesn't error if it's already applied.
-- 2. A trigger enforcing the *transition* graph (e.g. you cannot jump
--    'pending' -> 'delivered' directly, or move out of a terminal state).
--    This must be enforced in the DB, not just the client, because RLS
--    policies alone only check who can write, not whether the new value
--    is a legal next state.
--
-- Keep this transition map in sync with ORDER_STATUS_TRANSITIONS in
-- src/lib/orderStatus.ts (that file has the same live-schema mismatch
-- problem as everything else built on the earlier incorrect audit - it
-- assumes the app layer's column names, which are a separate, still-open
-- issue from this migration).

do $$
begin
  alter table orders
    add constraint orders_status_check
    check (status in ('pending', 'accepted', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'));
exception
  when duplicate_object then null;
end $$;

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

  return new;
end;
$$;

drop trigger if exists orders_enforce_status_transition on orders;

create trigger orders_enforce_status_transition
  before update on orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.enforce_order_status_transition();
