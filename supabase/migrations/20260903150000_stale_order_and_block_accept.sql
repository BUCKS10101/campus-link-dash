-- Phase 3J (6/8): stale-order expiry (§6) combined with the block
-- exclusion on order acceptance (§4), into ONE final version each of
-- orders_select_pending_feed and orders_update_accept - see
-- PHASE3_3J_TRUST_SAFETY_SPEC.md §13 point 6 ("sequence this after
-- block enforcement specifically so the two sets of orders_update_accept
-- changes are combined into one final policy version instead of two
-- separate migrations fighting each other").
--
-- No new column, status, table, or scheduled job (approach D from spec
-- §6's four-option comparison) - "stale" is a computed property of
-- created_at, checked live by the policies themselves, exactly the same
-- pattern orders_select_pending_feed already used for status = 'pending'.
-- Threshold: 12 hours, per the approved product decision (spec §6/§15
-- decision #3).
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until this whole 3J feature set is verified end-to-end (§13 step 8).

-- ============ orders_select_pending_feed ============
-- Old body (20260824120000_rls_policies_and_indexes.sql):
--   using (status = 'pending')
-- New: adds a 12-hour created_at bound - strictly narrower, never
-- broader. orders_select_participant (unbounded, requester_id =
-- auth.uid() or deliverer_id = auth.uid()) is untouched - a requester
-- still sees their own stale order in Activity/Ordering-active exactly
-- as before, still cancellable via the unmodified 3G flow (spec §6).

drop policy if exists "orders_select_pending_feed" on orders;
create policy "orders_select_pending_feed"
  on orders for select
  using (status = 'pending' and created_at > now() - interval '12 hours');

-- ============ orders_update_accept ============
-- Old body (20260824120000_rls_policies_and_indexes.sql):
--   using (status = 'pending' and deliverer_id is null)
--   with check (deliverer_id = auth.uid())
-- New: adds BOTH the same 12-hour created_at bound (USING - the row
-- being accepted must itself still be fresh) AND the bidirectional
-- block-exclusion subquery (WITH CHECK - the accepting deliverer and the
-- order's requester must not be blocked in either direction). Both are
-- strict narrowings of the existing clauses, combined here rather than
-- across two competing migrations (see header note).

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
    and not exists (
      select 1 from blocks
      where (blocker_id = auth.uid() and blocked_id = orders.requester_id)
         or (blocker_id = orders.requester_id and blocked_id = auth.uid())
    )
  );

-- ============ VERIFY AFTER APPLYING ============
-- Manual checks (see spec §10):
--   a stale (>12h old, backdated created_at for a test row) pending
--     order no longer appears in a stranger's orders_select_pending_feed
--     -scoped query.
--   a direct accept attempt on that same stale order fails at the DB
--     layer (0 rows updated).
--   the requester's own orders_select_participant-scoped view of that
--     same stale order is completely unaffected - it still shows up in
--     their Activity/Ordering-active list, still 'pending', still
--     cancellable.
--   a blocked-in-either-direction pair's accept attempt on an otherwise
--     fresh, unassigned order fails at the DB layer, verified via a
--     direct update call bypassing the frontend.
--   a non-blocked, non-stale accept attempt still succeeds exactly as
--     before this migration.
