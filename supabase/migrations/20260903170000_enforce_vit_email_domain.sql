-- Phase 3J (8/8): server-side @vitstudent.ac.in enforcement - a
-- BEFORE INSERT trigger on auth.users - see
-- PHASE3_3J_TRUST_SAFETY_SPEC.md §2/§11/§13.
--
-- This is the one place in 3J's entire design that touches the `auth`
-- schema with a STRUCTURAL object (a trigger, not a one-time backfill
-- like 20260903160000_email_verification_grandfather.sql) - flagged
-- explicitly because it breaks this repo's own long-standing
-- "migrations never touch auth" convention, for a deliberate, necessary
-- reason: there is no other server-side hook point that runs before a
-- row lands in auth.users. Unlike the grandfather backfill, this trigger
-- IS meant to be applied as a normal structural migration (it's
-- additive/idempotent and has no destructive blast radius of its own -
-- see the "why it cannot break existing accounts" reasoning below) -
-- the only reason it's still called out this heavily is that it's the
-- one exception to the "never touch auth" rule, not because it's unsafe
-- to apply.
--
-- Enabling Supabase's "Confirm email" Dashboard setting (required
-- separately - see spec §2 "Required Supabase Dashboard configuration")
-- proves OWNERSHIP of whatever address was used; it does not restrict
-- WHICH domains may register at all. This trigger closes that separate
-- gap - the actual, un-bypassable server-side equivalent of validation.ts's
-- client-side VIT_EMAIL regex (which a direct supabase.auth.signUp() call
-- bypassing the frontend entirely is not otherwise subject to at all).
--
-- Why this cannot break existing accounts: a BEFORE INSERT trigger only
-- ever fires on new rows being inserted - it structurally cannot affect,
-- block, delete, or re-evaluate any row already in auth.users. Every
-- account created before this trigger exists is unaffected, by
-- definition, forever. Empirically verified against staging during the
-- spec pass: all 34 existing auth.users rows already have a
-- @vitstudent.ac.in address (zero non-VIT, zero null) - no latent
-- non-compliant row exists that this migration needs to special-case.
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until this whole 3J feature set is verified end-to-end (§13 step 8) -
-- and per spec §2's "Proving the trigger is safe" section, verify each
-- of the following live against staging before considering this correct
-- (not just from reading the SQL):
--   1. A normal @vitstudent.ac.in signup still succeeds, unchanged.
--   2. No OAuth/admin path is broken (this codebase has none today -
--      confirmed by full-repo search, only signUp()/signInWithPassword()
--      exist in useAuth.tsx - the service_role exemption below exists
--      for a FUTURE admin operation, not a current one).
--   3. Re-running this project's full migration set against a clean
--      database with this trigger included does not break any other
--      migration (none of them insert into auth.users - confirmed via
--      full-repo search).
--   4. Case-insensitive matching: "Student@VITStudent.AC.IN" is
--      accepted; "student@VITSTUDENT.AC.IN.evil.com" is rejected (the
--      anchored regex, not substring matching, is what makes this true).
--   5. A direct SQL insert with email = null or email = '' is rejected
--      with the "valid email address is required" exception.
--   6. A direct supabase.auth.signUp({email: 'anyone@gmail.com', ...})
--      call, bypassing the frontend entirely, fails at the database
--      layer - the actual proof the boundary is server-side.

create or replace function public.enforce_vit_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Administrative/system inserts are exempt, not the signup path
  -- itself: this project has no OAuth provider configured (confirmed -
  -- src/hooks/useAuth.tsx only ever calls signUp()/signInWithPassword(),
  -- no signInWithOAuth anywhere in the codebase) and no admin-user-creation
  -- feature exists today, so this branch is not exercised by any current
  -- code path - it exists so a *future* legitimate administrative action
  -- (e.g. the Supabase Dashboard's own "Add user" admin operation,
  -- issued as the service_role, which also inserts into auth.users and
  -- would otherwise be blocked by this same trigger with no way around
  -- it) is never silently broken by a rule meant only to constrain
  -- self-service signup.
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  -- Fail safe, not fail open, on a malformed/null email - a null or
  -- empty email should never have reached this point in a normal
  -- signup (Supabase's own auth flow requires one), but if it
  -- somehow did, the correct behavior is to reject, not to let a
  -- vacuous regex match let it through.
  if new.email is null or btrim(new.email) = '' then
    raise exception 'A valid email address is required'
      using errcode = 'check_violation';
  end if;

  -- Case-insensitive by construction (~* is the case-insensitive regex
  -- operator, matching VIT_EMAIL's own /i flag in validation.ts exactly)
  -- - "Student@VITStudent.AC.IN" must be accepted exactly like
  -- "student@vitstudent.ac.in" is.
  if new.email !~* '^[^@[:space:]]+@vitstudent\.ac\.in$' then
    raise exception 'Only @vitstudent.ac.in email addresses may register'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists auth_users_enforce_vit_domain on auth.users;
create trigger auth_users_enforce_vit_domain
  before insert on auth.users
  for each row execute function public.enforce_vit_email_domain();

-- ============ VERIFY AFTER APPLYING ============
-- See the six numbered staging-verification steps in the header above -
-- all six must be demonstrated against real staging, not inferred from
-- this SQL alone, per spec §2.
