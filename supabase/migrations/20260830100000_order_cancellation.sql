-- Phase 3G: order cancellation - see PHASE3_3G_DELIVERY_LIFECYCLE_SPEC.md.
--
-- Additive only. No existing column, policy, or grant is removed. Two new
-- nullable columns, one new RLS policy, one extended trigger function
-- (transition timestamps), one extended trigger function (notifications),
-- one widened CHECK constraint (notification type list).
--
-- STATUS: prepared in the repo. Apply to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

-- ============ COLUMNS ============

alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancelled_by uuid references profiles(id);

-- Both are stamped exclusively by enforce_order_status_transition() below,
-- inside the same BEFORE UPDATE row that performs the transition itself -
-- never by a client-issued value. Accordingly: SELECT only, no UPDATE
-- grant on either column, for any role. The existing
-- `grant update (deliverer_id, status) on orders to authenticated`
-- (20260825090000_fix_otp_column_privileges.sql) is untouched - a
-- cancelling client only ever needs to write `status`, exactly like
-- acceptOrder/updateOrderStatus already do.
grant select (cancelled_at, cancelled_by) on orders to authenticated;

-- ============ TRANSITION TRIGGER: add cancellation timestamp/actor ============
-- Same function, same trigger, same firing point as
-- 20260824120100_order_status_integrity.sql - extended, not replaced. The
-- existing 'delivered'/OTP-flag branch and the transition `allowed` array
-- are byte-identical to before; the only addition is the block that
-- stamps cancelled_at/cancelled_by when the transition target is
-- 'cancelled'. Because this happens inside the trigger that runs before
-- every status-changing write lands, there is no window in which a
-- client could observe (or overwrite) a status of 'cancelled' without
-- these two columns already being set - and since 'cancelled' is
-- terminal (allowed[] = []), no later write can ever revisit them.

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

-- ============ RLS: requester cancellation ============
-- The only new authorization path. Deliverer cancellation needs no new
-- policy - orders_update_assigned_deliverer (20260824120000) already
-- permits an assigned deliverer to update their order's status from
-- 'accepted'/'picked_up'/'out_for_delivery' with no status restriction of
-- its own; enforce_order_status_transition() above is what already limits
-- which transitions (including 'cancelled') that deliverer may make. 3G
-- only adds the requester side, which previously had no UPDATE policy on
-- orders at all.
--
-- This is a single, atomic, conditional UPDATE from the client's
-- perspective - not a read-then-write. USING is evaluated against the
-- row's current (pre-update) state at the moment the UPDATE statement
-- actually runs, so a requester's cancel racing a deliverer's simultaneous
-- advance resolves deterministically: whichever UPDATE's row lock is
-- acquired first commits, and the second statement's USING clause is then
-- evaluated against the already-committed new status, matching zero rows
-- (PostgREST reports this as a 0-row result, not an error) rather than
-- overwriting anything. See PHASE3_3G_DELIVERY_LIFECYCLE_SPEC.md §4/§11.

drop policy if exists "orders_update_requester_cancel" on orders;
create policy "orders_update_requester_cancel"
  on orders for update
  using (auth.uid() = requester_id and status in ('pending', 'accepted'))
  with check (auth.uid() = requester_id and status = 'cancelled');

-- ============ NOTIFICATIONS: order_cancelled type ============
-- Same DROP/ADD CONSTRAINT idiom 3E already used to add friendship_id
-- support (20260828100000_social_graph.sql) - additive, not a rewrite.

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'order_accepted', 'order_picked_up', 'order_out_for_delivery',
    'order_delivered', 'order_cancelled', 'new_chat_message',
    'friend_request_received', 'friend_request_accepted'
  ));

-- ============ NOTIFICATIONS: cancellation recipient ============
-- Same function, same trigger as 20260827200000_notifications.sql -
-- extended, not replaced. The existing four-type mapping (all of which
-- always notify new.requester_id) is untouched below; only a new
-- 'cancelled' branch is added, which is the one case where the recipient
-- is NOT always the requester - it's whichever participant did not
-- perform the cancelling write. auth.uid() (not a client-supplied value)
-- decides which side that is. A pending order that's cancelled before
-- anyone accepted it (deliverer_id is null) notifies no one - there is no
-- one to tell.

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
begin
  if new.status = 'cancelled' then
    if new.deliverer_id is not null then
      if auth.uid() = new.requester_id then
        insert into notifications (recipient_id, type, order_id)
        values (new.deliverer_id, 'order_cancelled', new.id)
        on conflict (recipient_id, order_id, type) do nothing;
      elsif auth.uid() = new.deliverer_id then
        insert into notifications (recipient_id, type, order_id)
        values (new.requester_id, 'order_cancelled', new.id)
        on conflict (recipient_id, order_id, type) do nothing;
      end if;
    end if;
    return new;
  end if;

  v_type := case new.status
    when 'accepted' then 'order_accepted'
    when 'picked_up' then 'order_picked_up'
    when 'out_for_delivery' then 'order_out_for_delivery'
    when 'delivered' then 'order_delivered'
    else null
  end;

  if v_type is null then
    return new;
  end if;

  insert into notifications (recipient_id, type, order_id)
  values (new.requester_id, v_type, new.id)
  on conflict (recipient_id, order_id, type) do nothing;

  return new;
end;
$$;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_column_privilege('authenticated', 'orders', 'cancelled_at', 'UPDATE');
--   select has_column_privilege('authenticated', 'orders', 'cancelled_by', 'UPDATE');
--   select has_column_privilege('anon', 'orders', 'cancelled_at', 'SELECT');
-- Expect true:
--   select has_column_privilege('authenticated', 'orders', 'cancelled_at', 'SELECT');
--   select has_column_privilege('authenticated', 'orders', 'cancelled_by', 'SELECT');
--   select has_column_privilege('authenticated', 'orders', 'status', 'UPDATE'); -- unchanged, pre-existing
-- Manual transition checks (see spec §14 for the full matrix):
--   requester cancel of their own 'pending'/'accepted' order -> succeeds,
--     cancelled_at/cancelled_by set to now()/that requester's id.
--   requester cancel attempt on 'picked_up'/'out_for_delivery' -> 0 rows
--     affected (RLS USING excludes those statuses for the requester).
--   deliverer cancel of their assigned 'accepted'/'picked_up'/
--     'out_for_delivery' order -> succeeds (pre-existing RLS + trigger,
--     unchanged by this migration).
--   any cancel attempt on an already 'delivered'/'cancelled' order -> 0
--     rows / rejected by enforce_order_status_transition's allowed[] = [].
