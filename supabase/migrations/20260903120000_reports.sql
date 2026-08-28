-- Phase 3J (3/8): report system - see PHASE3_3J_TRUST_SAFETY_SPEC.md
-- §5/§13. Additive only; the one dependency this migration has is on
-- 20260903110000_rate_limit_events.sql's check_and_record_rate_limit(),
-- already applied before this file.
--
-- STATUS: prepared in the repo. Apply to STAGING only, never production,
-- until this whole 3J feature set is verified end-to-end (§13 step 8).

-- ============ TABLE ============

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_user_id uuid not null references profiles(id) on delete cascade,
  -- on delete set null (not cascade) - a report must survive even if the
  -- underlying order is later deleted. Orders are never hard-deleted
  -- anywhere in this schema today, but this is the correct, defensive
  -- default for a moderation-evidence table regardless (spec §5).
  order_id uuid references orders(id) on delete set null,
  reason text not null check (reason in (
    'no_show', 'unsafe_behavior', 'harassment', 'inappropriate_content',
    'suspected_fake_account', 'other'
  )),
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  constraint reports_no_self_report check (reporter_id <> reported_user_id)
);

create index if not exists reports_reported_user_id_idx on reports (reported_user_id);

-- ============ RLS ============
-- A reporter may see their own filed reports (so the UI can show "you
-- reported this" state) - never reports filed against them, never
-- anyone else's reports. No UPDATE/DELETE policy or grant exists at
-- all - a report, once filed, is immutable (spec §5).

alter table reports enable row level security;

drop policy if exists "reports_select_own" on reports;
create policy "reports_select_own"
  on reports for select
  using (reporter_id = auth.uid());

revoke all on reports from anon, authenticated;
grant select on reports to authenticated;
-- No insert/update/delete grant to any client role - the only write
-- path is file_report() below.

-- ============ WRITE PATH: file_report() ============
-- Self-report guarded exactly like send_friend_request()'s/
-- block_user()'s existing self-action guards. reporter_id is always
-- auth.uid(), never a client-supplied parameter. p_order_id is
-- deliberately NOT validated against "were you actually a participant
-- on this order" in V1 - a student should be able to report a profile
-- encountered anywhere (chat, a friend request, a search result)
-- without an order necessarily existing - see spec §5.

create or replace function public.file_report(
  p_reported_user_id uuid, p_order_id uuid, p_reason text, p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_allowed boolean;
begin
  if p_reported_user_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;

  -- 5 reports/day - reuses the shared rate limiter (spec §3/§5) rather
  -- than a bespoke mechanism.
  select public.check_and_record_rate_limit('file_report', 5, 1440) into v_allowed;
  if not v_allowed then
    raise exception 'You have reported the maximum number of times today';
  end if;

  insert into reports (reporter_id, reported_user_id, order_id, reason, description)
  values (auth.uid(), p_reported_user_id, p_order_id, p_reason, nullif(trim(p_description), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.file_report(uuid, uuid, text, text) from public, anon;
grant execute on function public.file_report(uuid, uuid, text, text) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_table_privilege('anon', 'reports', 'SELECT');
--   select has_table_privilege('authenticated', 'reports', 'INSERT');
--   select has_table_privilege('authenticated', 'reports', 'UPDATE');
--   select has_table_privilege('authenticated', 'reports', 'DELETE');
-- Expect true:
--   select has_table_privilege('authenticated', 'reports', 'SELECT');
--   select has_function_privilege('authenticated', 'file_report(uuid,uuid,text,text)', 'EXECUTE');
-- Manual checks (see spec §10):
--   file_report(self) raises "You cannot report yourself".
--   a stranger cannot select another user's reports row directly.
--   a reason outside the fixed enum is rejected by the CHECK constraint.
--   a description over 500 chars is rejected by the CHECK constraint.
--   the 6th file_report() call within 24h for one user raises the
--     rate-limit exception; the first 5 all succeed.
