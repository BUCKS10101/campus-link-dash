-- Phase 1B: profiles.id -> auth.users.id foreign key.
--
-- SPLIT OUT from 20260824120200_foreign_keys.sql on purpose. Unlike every
-- other FK in this project, this one is NOT confirmed to already exist
-- (pg_constraint has no profiles_id_fkey / users_id_fkey-style entry), and
-- profiles.id has its own independent default (gen_random_uuid()) rather
-- than being declared `references auth.users(id)` - meaning it's possible
-- (not confirmed either way) for a profiles row to exist whose id doesn't
-- match any auth.users row, e.g. from manual/seed data. If that's true
-- for even one row, this ALTER fails outright (a real FK violation, not
-- caught by the duplicate_object guard used elsewhere in these
-- migrations, since that only guards against the constraint already
-- existing).
--
-- Splitting it into its own file means: if it fails, it fails alone - it
-- does not roll back or block the RLS/index/status-integrity/OTP
-- migrations, which don't depend on it and are safe to apply regardless.
--
-- CONFIRMED SAFE as of 2026-08-24: ran the orphan check below against the
-- live database and it returned zero rows, so every profiles.id currently
-- matches a real auth.users.id.
--   select p.id from profiles p
--   left join auth.users u on u.id = p.id
--   where u.id is null;
-- This only reflects the state at check time - if new profile rows can be
-- created independently of auth signup (e.g. an admin/seed path that
-- doesn't go through supabase.auth.signUp), re-run that check before
-- applying this file if meaningful time has passed or new write paths
-- were added.
--
-- ON DELETE: deliberately the default (NO ACTION), not CASCADE. Deleting
-- an auth.users row while a profiles row still references it will fail
-- outright rather than silently deleting the profile (and, transitively,
-- anything a cascade might reach). CampusLink has no defined
-- account-deletion/data-retention policy yet - automatic profile deletion
-- is a product decision to be made deliberately when that policy exists,
-- not a side effect of adding this FK.
--
-- STATUS: prepared in the repo, NOT verified applied to any live Supabase
-- project. Verified safe against current data (see above) but still
-- unapplied.

do $$
begin
  alter table profiles
    add constraint profiles_id_fkey
    foreign key (id) references auth.users(id);
exception
  when duplicate_object then null;
end $$;
