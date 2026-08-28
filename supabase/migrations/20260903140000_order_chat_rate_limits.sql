-- Phase 3J (5/8): wire check_and_record_rate_limit() into order
-- creation, order acceptance, chat messages, and friend requests - see
-- PHASE3_3J_TRUST_SAFETY_SPEC.md §3/§13/§15 decision #4.
--
-- Architecture decision (§15 #4, resolved as instructed): orders and
-- chat_messages are both direct-insert tables (createOrder()/
-- sendMessage() insert straight from the client, unlike ratings/
-- friendships' RPC-mediated writes) - rather than converting either to
-- an RPC wrapper (a real architectural change to two core, high-traffic
-- tables), rate limiting is expressed as BEFORE INSERT/UPDATE triggers
-- that call check_and_record_rate_limit() internally. This preserves
-- the existing direct-insert pattern entirely, mirroring how 3G's
-- enforce_order_status_transition() already sits as a BEFORE trigger on
-- orders doing exactly this kind of "reject before it's written"
-- enforcement. Rejections surface as a Postgres trigger exception,
-- which the frontend's existing getErrorMessage(err, fallback) pattern
-- already handles identically to an RPC's raise exception - no new
-- frontend error-handling code is needed.
--
-- Per-action limits, final per the approved product decision (spec §3):
--   orders            5  / 60 min  per user
--   order acceptance  10 / 10 min  per user
--   chat messages      30 / 10 min  per user, PER ORDER (not global)
--   friend requests    10 / 60 min  per user
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until this whole 3J feature set is verified end-to-end (§13 step 8).

-- ============ ORDERS: creation rate limit ============
-- A plain BEFORE INSERT trigger, alongside (not replacing) the existing
-- orders_insert_own RLS policy - RLS still decides WHO may insert
-- (auth.uid() = requester_id); this trigger decides HOW OFTEN. Keyed to
-- new.requester_id, which RLS already guarantees equals auth.uid() by
-- the time this trigger runs.

create or replace function public.enforce_order_creation_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
begin
  select public.check_and_record_rate_limit('create_order', 5, 60) into v_allowed;
  if not v_allowed then
    raise exception 'Please slow down - try again in a few minutes'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_order_creation_rate_limit() from public, anon, authenticated;

drop trigger if exists orders_enforce_creation_rate_limit on orders;
create trigger orders_enforce_creation_rate_limit
  before insert on orders
  for each row
  execute function public.enforce_order_creation_rate_limit();

-- ============ ORDERS: acceptance rate limit ============
-- Fires only on a genuine pending -> accepted transition (the row must
-- already have passed orders_update_accept's own USING clause to reach
-- this trigger at all - a "someone already took it" attempt matches
-- zero rows and never fires any trigger, exactly as the atomic
-- compare-and-swap already made cheap and harmless per spec §3). Keyed
-- to new.deliverer_id, which orders_update_accept's WITH CHECK already
-- guarantees equals auth.uid().

create or replace function public.enforce_order_accept_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
begin
  select public.check_and_record_rate_limit('accept_order', 10, 10) into v_allowed;
  if not v_allowed then
    raise exception 'Please slow down - try again in a few minutes'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_order_accept_rate_limit() from public, anon, authenticated;

drop trigger if exists orders_enforce_accept_rate_limit on orders;
create trigger orders_enforce_accept_rate_limit
  before update on orders
  for each row
  when (old.status = 'pending' and new.status = 'accepted')
  execute function public.enforce_order_accept_rate_limit();

-- ============ CHAT MESSAGES: per-order rate limit ============
-- Scoped per user PER ORDER (not global), per spec §3's explicit
-- reasoning: a busy conversation on one order should never throttle a
-- user's ability to message on a different order. The action string
-- itself encodes the order id so check_and_record_rate_limit's existing
-- (user_id, action, created_at) index naturally scopes the count.

create or replace function public.enforce_chat_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
begin
  select public.check_and_record_rate_limit('chat_message:' || new.order_id::text, 30, 10) into v_allowed;
  if not v_allowed then
    raise exception 'Please slow down - try again in a few minutes'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_chat_message_rate_limit() from public, anon, authenticated;

drop trigger if exists chat_messages_enforce_rate_limit on chat_messages;
create trigger chat_messages_enforce_rate_limit
  before insert on chat_messages
  for each row
  execute function public.enforce_chat_message_rate_limit();

-- ============ FRIEND REQUESTS: send_friend_request() ============
-- Recreated again (third time across 3E/20260903130000/here) to ADD the
-- rate-limit check on top of the self-request and block guards the
-- previous migration already established - not to replace them. This is
-- an RPC (not a direct-insert table), so the rate limit is a plain
-- internal call at the top of the function body, same shape as
-- file_report()'s.

create or replace function public.send_friend_request(p_addressee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_allowed boolean;
begin
  if p_addressee_id = auth.uid() then
    raise exception 'You cannot send yourself a friend request';
  end if;

  if exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = p_addressee_id)
       or (blocker_id = p_addressee_id and blocked_id = auth.uid())
  ) then
    raise exception 'Couldn''t send friend request. Please try again.';
  end if;

  select public.check_and_record_rate_limit('friend_request', 10, 60) into v_allowed;
  if not v_allowed then
    raise exception 'Please slow down - try again in a few minutes'
      using errcode = 'P0001';
  end if;

  insert into friendships (requester_id, addressee_id, status)
  values (auth.uid(), p_addressee_id, 'pending')
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'A relationship with this student already exists';
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Manual checks (see spec §10):
--   the 6th createOrder() insert within 60 min for one user is rejected
--     with "Please slow down..."; the first 5 succeed.
--   the 11th successful accept within 10 min for one user is rejected;
--     the first 10 succeed. Failed/raced accepts (already taken) are
--     never counted (the trigger never fires for a 0-row update).
--   the 31st chat message on ONE order within 10 min is rejected, but a
--     message sent to a DIFFERENT order in the same window still
--     succeeds (proves per-order, not global, scoping).
--   the 11th send_friend_request() within 60 min is rejected; the first
--     10 succeed. The self-request and block guards from the previous
--     migration are still both in effect (not reverted by this
--     recreation).
--   every rejection above surfaces as a plain exception message a
--     client-side getErrorMessage(err, fallback) call already renders
--     as a toast, with no new frontend error-handling code required.
