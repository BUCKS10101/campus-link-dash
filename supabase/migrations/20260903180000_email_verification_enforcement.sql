-- Phase 3J (email verification, server-side action gate): closes the
-- "must survive a malicious client" requirement for the four gated
-- actions in PHASE3_3J_TRUST_SAFETY_SPEC.md §2's action table (post,
-- accept, message, friend-request) - see §2: "Enforcement must be both
-- client-side ... and server-side ... the client gate is UX, the
-- RLS/RPC gate is the real boundary."
--
-- Note on why this is its own migration, separate from
-- 20260903170000_enforce_vit_email_domain.sql: that file is the domain
-- restriction (WHO may sign up); this one is the action gate (WHAT an
-- already-signed-up-but-unverified account may do), a distinct concern
-- with a distinct mechanism (per-request auth.users lookup, not an
-- insert-time trigger on auth.users itself). Both are part of the same
-- "Email verification" step (§13's step 7, last in the implementation
-- order) and should be applied together.
--
-- Mechanism: authenticated clients have no SELECT grant on Supabase's
-- own auth.users table (by platform design - only auth.uid()/auth.jwt()
-- are exposed, not raw table access), and email_confirmed_at is not
-- present in the default JWT claims, so it cannot be read directly from
-- an RLS policy's `using`/`with check` clause the way `blocks`/
-- `user_preferences` rows can. Each of the four gated write paths is
-- therefore extended with one extra call to
-- public.current_user_email_verified() - a small SECURITY DEFINER
-- helper (same privilege-boundary shape as check_and_record_rate_limit())
-- that reads auth.users as its owner, bypassing the grant restriction
-- that blocks a client from reading it directly. This mirrors the
-- codebase's own established "the server, never the client, decides"
-- discipline (e.g. enforce_order_status_transition()'s
-- campuslink.otp_verified session flag).
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until this whole 3J feature set is verified end-to-end (§13 step 8) -
-- and only once the "Confirm email" Dashboard setting is actually turned
-- on for that environment and the grandfather backfill
-- (20260903160000_email_verification_grandfather.sql) has run, per §2 -
-- applying this migration alone, without the Dashboard setting and the
-- backfill, would incorrectly treat every pre-3J account as unverified.

-- ============ HELPER ============

create or replace function public.current_user_email_verified()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select email_confirmed_at is not null from auth.users where id = auth.uid();
$$;

revoke all on function public.current_user_email_verified() from public, anon, authenticated;
-- Not directly exposed to the client - only called internally from the
-- triggers/RPCs below, same discipline as check_and_record_rate_limit().

-- ============ ORDERS: creation ============
-- A BEFORE INSERT trigger, alongside orders_enforce_creation_rate_limit
-- (20260903140000_order_chat_rate_limits.sql) - both are independent
-- "reject before it's written" checks on the same table, same pattern
-- 3G's enforce_order_status_transition() already established.

create or replace function public.enforce_order_creator_verified()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_email_verified() then
    raise exception 'Verify your email before posting a request'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_order_creator_verified() from public, anon, authenticated;

drop trigger if exists orders_enforce_creator_verified on orders;
create trigger orders_enforce_creator_verified
  before insert on orders
  for each row
  execute function public.enforce_order_creator_verified();

-- ============ ORDERS: acceptance ============
-- Same firing condition as orders_enforce_accept_rate_limit - only a
-- genuine pending -> accepted transition, which orders_update_accept's
-- own RLS clauses have already scoped to new.deliverer_id = auth.uid().

create or replace function public.enforce_order_acceptor_verified()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_email_verified() then
    raise exception 'Verify your email before accepting a request'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_order_acceptor_verified() from public, anon, authenticated;

drop trigger if exists orders_enforce_acceptor_verified on orders;
create trigger orders_enforce_acceptor_verified
  before update on orders
  for each row
  when (old.status = 'pending' and new.status = 'accepted')
  execute function public.enforce_order_acceptor_verified();

-- ============ CHAT MESSAGES ============

create or replace function public.enforce_chat_sender_verified()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_email_verified() then
    raise exception 'Verify your email before sending a message'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_chat_sender_verified() from public, anon, authenticated;

drop trigger if exists chat_messages_enforce_sender_verified on chat_messages;
create trigger chat_messages_enforce_sender_verified
  before insert on chat_messages
  for each row
  execute function public.enforce_chat_sender_verified();

-- ============ FRIEND REQUESTS: send_friend_request() ============
-- Recreated a fourth time (3E -> block guard -> rate-limit guard ->
-- here) to ADD the verification check on top of every guard the prior
-- migrations already established - none of the earlier checks are
-- removed or reordered in a way that changes their effect.

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

  if not public.current_user_email_verified() then
    raise exception 'Verify your email before sending a friend request';
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
--   an unverified account's direct insert into orders/chat_messages, or
--     direct send_friend_request() call, fails at the DB layer (not
--     just hidden in the UI) - verified via a direct RPC/insert call
--     bypassing the frontend entirely.
--   an unverified account's direct accept attempt (UPDATE ... set
--     status = 'accepted') on an otherwise-eligible pending order fails
--     at the DB layer.
--   a verified account is completely unaffected by any of the four
--     checks above.
--   a pre-3J account that went through the grandfather backfill
--     (20260903160000) is treated as verified by
--     current_user_email_verified() (email_confirmed_at is not null).
