-- Phase 3J bugfix #2 (found during real staging E2E behavioral
-- verification, immediately after applying bugfix #1 -
-- 20260903190000_fix_block_check_rls_recursion.sql): even with
-- is_blocked_pair() correctly wired into orders_update_accept's WITH
-- CHECK, a blocked deliverer could still successfully accept the
-- blocking requester's order. Root cause is NOT a flaw in
-- is_blocked_pair() (confirmed correct via direct call) or in
-- orders_update_accept's own WITH CHECK (confirmed correct by direct
-- inspection) - it's a pre-existing Postgres RLS multi-policy
-- composition trap: `orders_update_assigned_deliverer`
-- (20260824120000_rls_policies_and_indexes.sql, unmodified by 3J - it
-- exists for a deliverer's legitimate SUBSEQUENT status updates once
-- already assigned, e.g. accepted -> picked_up) has its own
-- `with check (auth.uid() = deliverer_id)`. For UPDATE, Postgres ORs
-- together the USING clauses of every applicable policy to decide
-- row-visibility, and SEPARATELY ORs together the WITH CHECK clauses of
-- every applicable policy to decide write-legality - the two are not
-- tied to the same policy. So a fresh accept (which only
-- orders_update_accept's own USING clause permits, since the old row's
-- deliverer_id is still null) can still be validated by
-- orders_update_assigned_deliverer's much simpler WITH CHECK
-- (`auth.uid() = deliverer_id`, trivially true for the new row), which
-- has no block/staleness awareness at all - silently bypassing
-- orders_update_accept's own (correct) block guard entirely. Confirmed
-- reproducible: a requester blocks a deliverer, the deliverer still
-- successfully accepts the requester's pending order.
--
-- This is a general property of RLS multi-policy composition, not
-- something a WITH CHECK clause alone can close once a second, simpler,
-- unrelated policy also grants EXECUTE on the same command - so the fix
-- moves the block check out of RLS entirely and into a BEFORE UPDATE
-- trigger scoped to exactly the pending->accepted transition, mirroring
-- the EXACT same pattern this phase's own
-- orders_enforce_accept_rate_limit and orders_enforce_acceptor_verified
-- triggers already use (20260903140000_order_chat_rate_limits.sql,
-- 20260903180000_email_verification_enforcement.sql) - both of which
-- were independently verified correct in staging E2E precisely because
-- a BEFORE trigger fires unconditionally for any row that reaches the
-- physical UPDATE, regardless of which RLS policy's WITH CHECK admitted
-- it. This is the actual unbypassable enforcement point; RLS's WITH
-- CHECK guard on orders_update_accept is left in place as harmless
-- defense-in-depth, not removed (still correctly blocks the case where
-- an ALREADY-assigned pairing later gets blocked and tries to re-accept
-- - though that's not a reachable state today since deliverer_id is
-- never cleared back to null).
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until re-verified end-to-end.

create or replace function public.enforce_order_accept_block_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_blocked_pair(new.deliverer_id, new.requester_id) then
    raise exception 'Couldn''t accept this order. Please try again.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_order_accept_block_check() from public, anon, authenticated;

drop trigger if exists orders_enforce_accept_block_check on orders;
create trigger orders_enforce_accept_block_check
  before update on orders
  for each row
  when (old.status = 'pending' and new.status = 'accepted')
  execute function public.enforce_order_accept_block_check();

-- ============ VERIFY AFTER APPLYING ============
-- Manual checks:
--   A requester blocks a deliverer D -> D's direct accept attempt (via
--     the anon-key REST path, exactly the way orders_update_assigned_deliverer
--     was observed to let it through before this fix) on that
--     requester's pending order now fails, and the order row remains
--     status='pending', deliverer_id=null (confirmed via a direct DB
--     read after the attempt, not just the client-side error).
--   An unrelated (non-blocked) accept still succeeds exactly as before
--     (no over-blocking regression - the trigger's WHEN clause only
--     ever fires on the pending->accepted transition, and only rejects
--     when is_blocked_pair() is genuinely true).
--   A legitimate SUBSEQUENT status update by an already-assigned,
--     non-blocked deliverer (e.g. accepted -> picked_up) is completely
--     unaffected - this trigger's WHEN clause never matches that
--     transition at all.
