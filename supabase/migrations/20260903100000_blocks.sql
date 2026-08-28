-- Phase 3J (1/8): block system, table + RPCs only - see
-- PHASE3_3J_TRUST_SAFETY_SPEC.md §4/§13. Deliberately additive and
-- isolated: no enforcement wiring into chat/accept/notifications yet
-- (that's 20260903130000_block_enforcement.sql) - this migration only
-- introduces the table, its RLS, and the two write RPCs, so it can be
-- verified correct in isolation before anything else depends on it.
--
-- Directional, NOT the friendships canonical-pair pattern (3E,
-- 20260828100000_social_graph.sql): A blocking B is not the same fact as
-- B blocking A, so a plain unique(blocker_id, blocked_id) is used
-- instead of a least/greatest canonical-pair index - see spec §4.
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until this whole 3J feature set is verified end-to-end (§13 step 8).

-- ============ TABLE ============

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_no_self_block check (blocker_id <> blocked_id),
  constraint blocks_unique_pair unique (blocker_id, blocked_id)
);

create index if not exists blocks_blocked_id_idx on blocks (blocked_id);

-- ============ RLS ============
-- A user may only ever SELECT their own blocks (who THEY'VE blocked) -
-- never who has blocked them. Exposing "who blocked me" would itself be
-- a privacy leak / retaliation vector - see spec §4's explicit reasoning,
-- mirrored again in the block_user() unblock comments below.

alter table blocks enable row level security;

drop policy if exists "blocks_select_own" on blocks;
create policy "blocks_select_own"
  on blocks for select
  using (blocker_id = auth.uid());

revoke all on blocks from anon, authenticated;
grant select on blocks to authenticated;
-- No insert/update/delete grant to any client role - the only write path
-- is block_user()/unblock_user() below, same discipline as friendships'
-- five RPCs (3E) and reports' file_report() (3J §5).

-- ============ WRITE PATH: block_user() / unblock_user() ============
-- Self-block guarded exactly like send_friend_request()'s existing
-- self-request guard (3E). blocker_id is always auth.uid(), never a
-- client-supplied parameter.

create or replace function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_blocked_id = auth.uid() then
    raise exception 'You cannot block yourself';
  end if;

  -- Idempotent: a second block(A,B) call is a silent no-op, never a
  -- client-visible error, for what's really an already-satisfied "still
  -- blocked" state - see spec §4.
  insert into blocks (blocker_id, blocked_id)
  values (auth.uid(), p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Blocking someone you're currently friends with also removes the
  -- friendship, in the same transaction - a block that leaves a
  -- "friends" relationship intact is incoherent (spec §4). Mirrors
  -- remove_friend()'s own delete, but doesn't require the accepted
  -- friendship's id from the caller (the caller only knows the person
  -- they're blocking, not the friendships row id).
  delete from friendships
  where status = 'accepted'
    and ((requester_id = auth.uid() and addressee_id = p_blocked_id)
      or (requester_id = p_blocked_id and addressee_id = auth.uid()));
end;
$$;

-- Unblocking simply deletes the row. Friendship is deliberately NOT
-- restored - unblocking undoes the block, it doesn't retroactively
-- re-friend (spec §4). A no-op (nothing to delete) is not an error,
-- same idempotent-write reasoning as block_user() above.
create or replace function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_blocked_id;
end;
$$;

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_table_privilege('anon', 'blocks', 'SELECT');
--   select has_table_privilege('authenticated', 'blocks', 'INSERT');
--   select has_function_privilege('anon', 'block_user(uuid)', 'EXECUTE');
-- Expect true:
--   select has_table_privilege('authenticated', 'blocks', 'SELECT');
--   select has_function_privilege('authenticated', 'block_user(uuid)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'unblock_user(uuid)', 'EXECUTE');
-- Manual checks (see spec §10):
--   A cannot select rows where blocker_id <> A (e.g. B's blocks of A).
--   block_user(self) raises "You cannot block yourself".
--   a duplicate block_user(same target) call is a silent no-op, not an error.
--   blocking a current friend deletes the friendships row atomically.
--   unblock_user() removes the block but leaves no friendship behind.
