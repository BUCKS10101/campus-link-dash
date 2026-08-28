-- Phase 3J (4/8): thread block checks through chat + the four
-- notification triggers - see PHASE3_3J_TRUST_SAFETY_SPEC.md §4/§7/§13.
-- Depends on 20260903100000_blocks.sql's `blocks` table already existing.
--
-- orders_update_accept is deliberately NOT touched here - its own block
-- guard is combined with the stale-order staleness bound into one final
-- policy version in 20260903150000_stale_order_and_block_accept.sql, per
-- spec §13 point 6 (two separate `create or replace policy` migrations
-- touching the same policy would fight each other instead of composing).
--
-- Every change below is a strict narrowing (an additional AND/guard),
-- never a removal of an existing check - the old bodies are reproduced
-- in full via `create or replace`, with the new guard called out inline,
-- matching this repo's own "fix"/"restrict" migration convention (see
-- 20260830200000_restrict_deliverer_cancellation.sql,
-- 20260831100000_user_preferences.sql).
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until this whole 3J feature set is verified end-to-end (§13 step 8).

-- ============ CHAT: chat_insert_participant ============
-- Old body (20260824120000_rls_policies_and_indexes.sql):
--   with check (
--     sender_id = auth.uid()
--     and order_id in (
--       select id from orders
--       where requester_id = auth.uid() or deliverer_id = auth.uid()
--     )
--   )
-- New: adds a bidirectional block-exclusion subquery - either party
-- having blocked the other now fails the insert, regardless of which
-- side sent it (spec §4). Existing message history is untouched (no
-- SELECT policy is modified) - only new inserts are affected.

drop policy if exists "chat_insert_participant" on chat_messages;
create policy "chat_insert_participant"
  on chat_messages for insert
  with check (
    sender_id = auth.uid()
    and order_id in (
      select id from orders
      where requester_id = auth.uid() or deliverer_id = auth.uid()
    )
    and not exists (
      select 1
      from orders o
      where o.id = order_id
        and exists (
          select 1 from blocks b
          where (b.blocker_id = auth.uid()
                 and b.blocked_id = (case when o.requester_id = auth.uid() then o.deliverer_id else o.requester_id end))
             or (b.blocked_id = auth.uid()
                 and b.blocker_id = (case when o.requester_id = auth.uid() then o.deliverer_id else o.requester_id end))
        )
    )
  );

-- ============ FRIEND REQUESTS: send_friend_request() ============
-- Old body (20260828100000_social_graph.sql): the self-request guard,
-- then a bare insert with a unique_violation handler. New: one
-- additional bidirectional block-existence check before the insert,
-- raising the same "you cannot..." exception shape send_friend_request()
-- already uses (spec §4). Reproduced here (rather than only in the next
-- migration) so this function is never left in a state where the block
-- guard silently disappeared between migrations - 20260903140000_order_
-- chat_rate_limits.sql recreates this same function again to ADD the
-- rate-limit check on top of this version, not to replace it.
create or replace function public.send_friend_request(p_addressee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_addressee_id = auth.uid() then
    raise exception 'You cannot send yourself a friend request';
  end if;

  -- Generic failure copy, deliberately not "you have been blocked" -
  -- surfacing that fact would itself be a harassment vector (spec §4's
  -- "who has blocked me" privacy reasoning, same as blocks_select_own).
  if exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = p_addressee_id)
       or (blocker_id = p_addressee_id and blocked_id = auth.uid())
  ) then
    raise exception 'Couldn''t send friend request. Please try again.';
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

-- ============ NOTIFICATIONS: block guards ============
-- Each of the four notification-inserting trigger functions gains one
-- additional guard, before its existing insert(s), mirroring 3H's exact
-- preference-guard shape (20260831100000_user_preferences.sql). Nothing
-- else in any of these four functions changes.

-- notify_order_status_change(): guards on the requester/deliverer pair -
-- this covers both the ordinary status-advance branch (accepted/
-- picked_up/out_for_delivery/delivered, always notifying requester_id)
-- and 3G's cancellation branch (order_cancellation.sql), which is
-- reproduced byte-identical below aside from the new guard at the top.
-- In practice a blocked pairing can never form in the first place once
-- 20260903150000_stale_order_and_block_accept.sql lands (orders_update_
-- accept itself refuses to pair a blocked deliverer/requester) - this
-- guard is the same defensive belt-and-suspenders 3H already established
-- for preferences, not the primary enforcement point.
create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
begin
  if new.deliverer_id is not null and exists (
    select 1 from blocks
    where (blocker_id = new.requester_id and blocked_id = new.deliverer_id)
       or (blocker_id = new.deliverer_id and blocked_id = new.requester_id)
  ) then
    return new;
  end if;

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

revoke all on function public.notify_order_status_change() from public;

-- notify_new_chat_message(): guards on sender/recipient - defensive,
-- since chat_insert_participant above already refuses the insert this
-- trigger would fire from once a block exists.
create or replace function public.notify_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
begin
  select
    case
      when o.requester_id = new.sender_id then o.deliverer_id
      else o.requester_id
    end
  into v_recipient
  from orders o
  where o.id = new.order_id;

  if v_recipient is null then
    return new;
  end if;

  if exists (
    select 1 from user_preferences
    where user_id = v_recipient and notify_chat_messages = false
  ) then
    return new;
  end if;

  if exists (
    select 1 from blocks
    where (blocker_id = new.sender_id and blocked_id = v_recipient)
       or (blocker_id = v_recipient and blocked_id = new.sender_id)
  ) then
    return new;
  end if;

  insert into notifications (recipient_id, type, order_id, created_at, read_at)
  values (v_recipient, 'new_chat_message', new.order_id, now(), null)
  on conflict (recipient_id, order_id, type)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_new_chat_message() from public;

-- notify_friend_request(): guards on requester/addressee - defensive,
-- since send_friend_request() itself (next migration) will already
-- refuse to insert the friendships row a blocked pair would need for
-- this trigger to fire.
create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from user_preferences
    where user_id = new.addressee_id and notify_friend_events = false
  ) then
    return new;
  end if;

  if exists (
    select 1 from blocks
    where (blocker_id = new.requester_id and blocked_id = new.addressee_id)
       or (blocker_id = new.addressee_id and blocked_id = new.requester_id)
  ) then
    return new;
  end if;

  insert into notifications (recipient_id, type, friendship_id)
  values (new.addressee_id, 'friend_request_received', new.id)
  on conflict (recipient_id, friendship_id, type) where friendship_id is not null do nothing;
  return new;
end;
$$;

revoke all on function public.notify_friend_request() from public, anon, authenticated;

-- notify_friend_accepted(): guards on requester/addressee. Unlike the
-- send-side, accept_friend_request() is NOT block-gated (spec §4 only
-- lists send_friend_request() for enforcement) - a pending request sent
-- before a block existed could still be accepted afterward; this guard
-- is what stops that edge case from generating a notification.
create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from user_preferences
    where user_id = new.requester_id and notify_friend_events = false
  ) then
    return new;
  end if;

  if exists (
    select 1 from blocks
    where (blocker_id = new.requester_id and blocked_id = new.addressee_id)
       or (blocker_id = new.addressee_id and blocked_id = new.requester_id)
  ) then
    return new;
  end if;

  insert into notifications (recipient_id, type, friendship_id)
  values (new.requester_id, 'friend_request_accepted', new.id)
  on conflict (recipient_id, friendship_id, type) where friendship_id is not null do nothing;
  return new;
end;
$$;

revoke all on function public.notify_friend_accepted() from public, anon, authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Manual checks (see spec §10):
--   a blocked-in-either-direction pair cannot insert into chat_messages
--     for a shared order, verified via a direct insert call bypassing
--     the frontend.
--   existing chat history between a now-blocked pair remains visible
--     (no SELECT policy was touched).
--   no notification row is created for any of the four types when the
--     two parties involved are blocked in either direction.
--   every existing, non-blocked notification path (order status,
--     chat message, friend request, friend accepted) is unaffected.
