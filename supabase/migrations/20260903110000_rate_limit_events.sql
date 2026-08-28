-- Phase 3J (2/8): rate_limit_events table + check_and_record_rate_limit()
-- - see PHASE3_3J_TRUST_SAFETY_SPEC.md §3/§13. Deliberately sequenced
-- before reports (3/8 in the spec's own illustrative table, moved ahead
-- of it here): file_report() (next migration) calls
-- check_and_record_rate_limit() internally, so this table/function must
-- exist first. This is the one place this repo's real filenames
-- intentionally diverge from the spec's illustrative migration numbers
-- (§11/§13 both say those names/order are "illustrative, not created") -
-- the dependency direction, not the numbering, is what matters.
--
-- A single small, reusable table + SECURITY DEFINER function, called
-- internally from inside each rate-limited write path - not a new
-- mechanism per action. No RLS SELECT policy at all is intentional: no
-- client, including the row's own owner, ever reads this table directly
-- (see spec §7) - it is only ever touched from inside
-- check_and_record_rate_limit(), which runs as its owner and is never
-- itself directly callable in a way that lets a client inspect another
-- user's rate-limit history.
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until this whole 3J feature set is verified end-to-end (§13 step 8).

-- ============ TABLE ============

create table if not exists rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_user_action_created_idx
  on rate_limit_events (user_id, action, created_at desc);

-- No RLS policy is created at all (RLS is enabled, but with zero
-- policies every role - including the row's own owner - is denied by
-- default). This is deliberate, not an oversight: see the header note
-- and spec §7's table entry for this object.
alter table rate_limit_events enable row level security;

revoke all on rate_limit_events from anon, authenticated;
-- No grant of any kind to any client role - only check_and_record_rate_limit()
-- (SECURITY DEFINER, below) ever reads or writes this table.

-- ============ FUNCTION ============
-- Returns true (allowed, and the attempt is now recorded) or false
-- (limit hit - the row is NOT inserted, so a rejected attempt never
-- itself counts toward the window). auth.uid() is the only identity
-- ever used - never a client-supplied parameter - so a malicious client
-- cannot pass another user's id to inspect or affect their limit.

create or replace function public.check_and_record_rate_limit(
  p_action text, p_limit integer, p_window_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from rate_limit_events
    where user_id = auth.uid() and action = p_action
      and created_at > now() - (p_window_minutes || ' minutes')::interval;

  if v_count >= p_limit then
    return false;
  end if;

  insert into rate_limit_events (user_id, action) values (auth.uid(), p_action);
  return true;
end;
$$;

-- Not directly exposed to the client as a standalone action a user would
-- invoke - only ever called internally by other SECURITY DEFINER
-- functions/triggers (file_report(), send_friend_request(), the
-- orders/chat_messages BEFORE INSERT triggers - see the later 3J
-- migrations). Granting authenticated execute here would let a client
-- call it directly with an arbitrary p_action/p_limit/p_window_minutes,
-- polluting another action's rate-limit window under a fabricated
-- action name - REVOKE ALL, no GRANT, matching the notify_* trigger
-- functions' own "never directly callable" precedent (3C/3H).
revoke all on function public.check_and_record_rate_limit(text, integer, integer) from public, anon, authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_table_privilege('authenticated', 'rate_limit_events', 'SELECT');
--   select has_function_privilege('authenticated', 'check_and_record_rate_limit(text,int,int)', 'EXECUTE');
-- Manual checks (see spec §10):
--   N calls within the window return true and each insert a row; the
--     (N+1)th within the same window returns false and inserts nothing.
--   once the window rolls forward (or old rows are backdated for a
--     test), a subsequent call returns true again.
