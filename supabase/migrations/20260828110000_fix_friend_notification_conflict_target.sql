-- Phase 3E follow-up: fix ON CONFLICT target mismatch.
--
-- CONFIRMED LIVE (2026-08-28) immediately after applying
-- 20260828100000_social_graph.sql: every send_friend_request() call
-- failed with "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification". Root cause: notify_friend_request() and
-- notify_friend_accepted() both used
--   on conflict (recipient_id, friendship_id, type) do nothing
-- but the actual dedup index is a PARTIAL unique index
-- (notifications_recipient_friendship_type_key ... where friendship_id
-- is not null) - Postgres requires an ON CONFLICT target to name a
-- partial index's predicate explicitly, or it won't match one at all,
-- and falls back to raising this error instead of silently ignoring it.
--
-- THE FIX: repeat the same "where friendship_id is not null" predicate
-- in the ON CONFLICT clause, so it actually matches the partial index.

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (recipient_id, type, friendship_id)
  values (new.addressee_id, 'friend_request_received', new.id)
  on conflict (recipient_id, friendship_id, type) where friendship_id is not null do nothing;
  return new;
end;
$$;

create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (recipient_id, type, friendship_id)
  values (new.requester_id, 'friend_request_accepted', new.id)
  on conflict (recipient_id, friendship_id, type) where friendship_id is not null do nothing;
  return new;
end;
$$;

-- Function bodies changed via CREATE OR REPLACE; privileges (already
-- revoked from every client role) are untouched by a body replace, no
-- need to re-assert them.
