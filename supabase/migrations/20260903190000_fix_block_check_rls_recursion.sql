-- Phase 3J bugfix (found during real staging E2E behavioral verification,
-- not caught by the earlier rolled-back-transaction dry run): the
-- bidirectional block-exclusion subqueries in `chat_insert_participant`
-- (20260903130000_block_enforcement.sql) and `orders_update_accept`
-- (20260903150000_stale_order_and_block_accept.sql) each query `blocks`
-- directly inside a plain RLS policy body - which means that query is
-- itself subject to `blocks`' own `blocks_select_own` policy
-- (`blocker_id = auth.uid()`, 20260903100000_blocks.sql). A plain policy
-- runs as the querying user, not as a privileged definer, so this makes
-- the block check asymmetric in practice: it correctly sees "I blocked
-- them" (blocker_id = my own auth.uid(), a row I'm allowed to select),
-- but is BLIND to "they blocked me" (blocker_id = someone else, a row
-- RLS hides from me entirely) - even though the SQL's OR clause was
-- written to check both directions. Confirmed via a real staging repro:
-- A blocks B; B can still successfully send a chat message to A on their
-- shared order, because B's own query against `blocks` never sees the
-- row where A is the blocker.
--
-- Fix: route both checks through a SECURITY DEFINER helper, exactly the
-- same pattern already established by check_and_record_rate_limit() and
-- current_user_email_verified() in this same phase - a SECURITY DEFINER
-- function runs as its owner (the table owner, by this project's own
-- migration convention), which is not subject to `blocks`' restrictive
-- SELECT policy, so it sees both directions of the relationship
-- regardless of which side is asking.
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until re-verified end-to-end. This migration is additive/corrective
-- only - no existing table or grant is removed, and 3H/3G/Activity/3I
-- are untouched.

create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

revoke all on function public.is_blocked_pair(uuid, uuid) from public, anon;
-- Unlike current_user_email_verified()/check_and_record_rate_limit(),
-- this helper is called DIRECTLY from a plain RLS policy body (below),
-- which executes as the querying role itself (authenticated), not
-- proxied through another SECURITY DEFINER function - so `authenticated`
-- needs EXECUTE here. The function's own body still only ever returns a
-- boolean (never row data), so this does not let a client read `blocks`
-- rows they aren't otherwise allowed to see - it only lets them ask
-- "are these two blocked", the same fact the chat/accept attempt itself
-- would otherwise leak via its success/failure regardless.
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- ============ CHAT: chat_insert_participant (corrected) ============

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
        and public.is_blocked_pair(
          auth.uid(),
          case when o.requester_id = auth.uid() then o.deliverer_id else o.requester_id end
        )
    )
  );

-- ============ ORDERS: orders_update_accept (corrected) ============

drop policy if exists "orders_update_accept" on orders;
create policy "orders_update_accept"
  on orders for update
  using (
    status = 'pending'
    and deliverer_id is null
    and created_at > now() - interval '12 hours'
  )
  with check (
    deliverer_id = auth.uid()
    and not public.is_blocked_pair(auth.uid(), requester_id)
  );

-- ============ VERIFY AFTER APPLYING ============
-- Manual checks:
--   A blocks B -> B's direct chat_messages insert on their shared order
--     is rejected (previously succeeded - this was the confirmed bug).
--   A blocks B -> A's own chat_messages insert is still rejected too
--     (this direction already worked correctly; must not regress).
--   A blocks B -> B's direct accept attempt on any of A's pending orders
--     is rejected (previously would have succeeded - same bug pattern).
--   A blocks B -> A's own accept attempt on any of B's requester-owned
--     pending orders is still rejected too (already worked; must not
--     regress).
--   An unrelated, non-blocked pair's chat/accept still succeeds exactly
--     as before (this fix must not narrow legitimate access).
