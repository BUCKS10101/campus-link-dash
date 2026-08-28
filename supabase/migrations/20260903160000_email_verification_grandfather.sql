-- Phase 3J (7/8): one-time grandfather backfill of email_confirmed_at
-- for pre-3J accounts - see PHASE3_3J_TRUST_SAFETY_SPEC.md §2/§11/§15
-- decision #1 (Option A, as approved).
--
-- ================================================================
-- THIS FILE TOUCHES SUPABASE'S OWN `auth` SCHEMA - NOT A NORMAL
-- ADDITIVE MIGRATION. It is a ONE-TIME DATA BACKFILL, not a structural
-- change, and per this repo's own long-standing convention (every prior
-- phase's migrations only ever touch `public`, never `auth`), it is NOT
-- meant to be applied blindly as part of a routine `supabase db push`
-- alongside the rest of this migration set - it must be run BY HAND,
-- ONCE, PER ENVIRONMENT, at the moment that environment actually rolls
-- out email verification (§2's "Confirm email" Dashboard toggle - see
-- 20260903170000_enforce_vit_email_domain.sql's own header for the
-- companion trigger this pairs with).
--
-- Guarded below with a session-local flag (the same
-- current_setting(...)-based pattern enforce_order_status_transition()
-- already uses for campuslink.otp_verified) so that a routine, unattended
-- `supabase db push` running this file as part of the normal migration
-- history is a harmless no-op (a NOTICE, not an UPDATE) rather than a
-- silent mass-grandfather of every account in whatever environment
-- happens to run it. To actually perform the backfill, an operator runs,
-- by hand, in a single session against the target environment:
--
--   set local campuslink.confirm_grandfather_backfill = 'yes-run-once';
--   \i supabase/migrations/20260903160000_email_verification_grandfather.sql
--
-- (or copy/paste the DO block's body directly after setting the flag).
-- Capture the affected user-id list BEFORE running, if a rollback might
-- ever be needed - see the rollback note at the bottom.
-- ================================================================
--
-- Rationale (spec §2): every account created before 3J ships has
-- email_confirmed_at = null (confirmation was never required at signup
-- time - see the spec's audit, §1). Applying the verification gate
-- without this backfill would suddenly lock every current real user out
-- of posting/accepting/messaging/friend-requesting. This is a one-time,
-- auditable, reversible-with-care SQL statement, not a new system - see
-- spec §2's "Existing (pre-3J) accounts" section for the full reasoning
-- and the explicit rollout-timestamp requirement below.
--
-- STATUS: prepared in the repo. Requires the operator to supply the
-- real rollout timestamp for the target environment before running (see
-- v_rollout_before below) - the placeholder here intentionally does
-- nothing useful until edited per environment.

do $$
declare
  -- REQUIRED: replace with the actual moment 3J's "Confirm email"
  -- Dashboard toggle is switched on for THIS environment. Every account
  -- created strictly before this timestamp is grandfathered; every
  -- account created at or after it goes through real confirmation.
  -- Left as an obviously-wrong sentinel on purpose, so an operator who
  -- runs this without editing it gets zero rows affected rather than a
  -- silently-wrong cutoff.
  v_rollout_before timestamptz := '1970-01-01T00:00:00Z';
  v_affected_count integer;
begin
  if current_setting('campuslink.confirm_grandfather_backfill', true) is distinct from 'yes-run-once' then
    raise notice 'Skipping email_confirmed_at grandfather backfill - campuslink.confirm_grandfather_backfill is not set to ''yes-run-once''. This is expected for a routine migration run; see this file''s header for how to run it by hand.';
    return;
  end if;

  if v_rollout_before = '1970-01-01T00:00:00Z' then
    raise exception 'v_rollout_before is still the placeholder sentinel - edit this DO block with the real 3J rollout timestamp for this environment before running the backfill.';
  end if;

  update auth.users
  set email_confirmed_at = now()
  where email_confirmed_at is null
    and created_at < v_rollout_before;

  get diagnostics v_affected_count = row_count;
  raise notice 'Grandfathered % pre-3J account(s) with created_at < %.', v_affected_count, v_rollout_before;
end $$;

-- ============ ROLLBACK ============
-- Cannot be cleanly rolled back automatically - it would need to null
-- out email_confirmed_at again for the EXACT backfilled set, not every
-- account with a null-turned-non-null value (a real confirmation
-- click after this ran would look identical). Capture the affected
-- user-id list BEFORE running, e.g.:
--   select id, email, created_at from auth.users
--   where email_confirmed_at is null and created_at < '<v_rollout_before>';
-- and restore only those specific ids' email_confirmed_at back to null
-- if a rollback is ever genuinely needed.

-- ============ VERIFY AFTER RUNNING (with the flag set, by hand) ============
--   select count(*) from auth.users where email_confirmed_at is null; -- should be ~0 for accounts created before the rollout timestamp
--   a pre-3J real account can still post/accept/message/friend-request
--     immediately after this runs, with no verification step required.
--   an account created AFTER the rollout timestamp is NOT grandfathered
--     - it still shows emailVerified: false until it actually confirms.
