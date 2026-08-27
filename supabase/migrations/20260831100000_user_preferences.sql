-- Phase 3H: preferences + personalization - see
-- PHASE3_3H_PREFERENCES_PERSONALIZATION_SPEC.md.
--
-- Additive only. Two new tables, both owner-scoped (RLS: user_id =
-- auth.uid(), no exceptions). Revoke-before-grant from the start (the
-- project's own established discipline after the OTP/3C/3D privilege
-- incidents - Supabase's platform-level default GRANT ALL silently
-- defeats additive grants otherwise). Extends three existing
-- SECURITY DEFINER notification triggers and one existing SECURITY
-- DEFINER search function with a preference check each - no new
-- SECURITY DEFINER function is introduced anywhere in this file; a
-- user's own preferences need only plain owner-scoped RLS to read/write.
--
-- No coordinate/position column of any kind, anywhere - live device
-- location (Discovery Mode A) is never sent to Supabase; only the user's
-- on/off intent (use_live_location) is persisted. See spec §3.3.
--
-- STATUS: prepared in the repo. Apply to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

-- ============ TABLES ============

create table if not exists user_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  -- Meaning is mode-dependent - see spec §3. Only consulted while
  -- use_live_location is true and a fresh position was obtained this
  -- session; ignored entirely in Mode B.
  discovery_radius_km numeric check (discovery_radius_km is null or discovery_radius_km > 0),
  use_live_location boolean not null default false,
  notify_chat_messages boolean not null default true,
  notify_friend_events boolean not null default true,
  discoverable boolean not null default true,
  use_friends_in_recommendations boolean not null default true,
  created_at timestamptz not null default now()
);
-- No updated_at: consistent with orders/ratings/friendships/notifications,
-- none of which carry one either in this schema.

create table if not exists user_preferred_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  campus_point_id uuid not null references campus_points(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_preferred_points_user_point_key unique (user_id, campus_point_id)
);

create index if not exists user_preferred_points_user_id_idx on user_preferred_points (user_id);

-- ============ RLS ============
-- A single "for all" policy per table is equivalent to writing separate
-- select/insert/update/delete policies here, since the condition
-- (user_id = auth.uid()) is identical across every command - there is no
-- case where a user should read their own row but not write it, or vice
-- versa, for either table.

alter table user_preferences enable row level security;

drop policy if exists "user_preferences_own_row" on user_preferences;
create policy "user_preferences_own_row"
  on user_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on user_preferences from anon, authenticated;
grant select, insert, update, delete on user_preferences to authenticated;

alter table user_preferred_points enable row level security;

drop policy if exists "user_preferred_points_own_rows" on user_preferred_points;
create policy "user_preferred_points_own_rows"
  on user_preferred_points for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on user_preferred_points from anon, authenticated;
grant select, insert, delete on user_preferred_points to authenticated;
-- no update: rows are only ever added or removed, never modified in place.

-- ============ NOTIFICATION PREFERENCES: real suppression ============
-- Each of the three trigger functions below gains exactly one guard,
-- before its existing insert - if the recipient has an explicit `false`
-- for the matching preference, the function returns without inserting.
-- A recipient with no user_preferences row (the default/legacy state) is
-- completely unaffected - the guard only ever short-circuits on an
-- explicit false, never on absence. Nothing else in any of these three
-- functions changes; the five order-lifecycle notification types
-- (handled by notify_order_status_change(), untouched by this migration)
-- have no preference and are never suppressed - see spec §6 for why.

create or replace function public.notify_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
begin
  select
    case
      when o.requester_id = new.sender_id then o.deliverer_id
      else o.requester_id
    end
  into v_recipient
  from orders o
  where o.id = new.order_id;

  if v_recipient is null then
    return new;
  end if;

  if exists (
    select 1 from user_preferences
    where user_id = v_recipient and notify_chat_messages = false
  ) then
    return new;
  end if;

  insert into notifications (recipient_id, type, order_id, created_at, read_at)
  values (v_recipient, 'new_chat_message', new.order_id, now(), null)
  on conflict (recipient_id, order_id, type)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_new_chat_message() from public;

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from user_preferences
    where user_id = new.addressee_id and notify_friend_events = false
  ) then
    return new;
  end if;

  -- Pre-existing 3E bug, fixed here incidentally: notifications_recipient_
  -- friendship_type_key is a PARTIAL unique index (`where friendship_id is
  -- not null`) - Postgres will only use a partial index to satisfy
  -- ON CONFLICT inference when the ON CONFLICT clause's own predicate
  -- matches. The original clause below had no such predicate, so this
  -- INSERT unconditionally raised "no unique or exclusion constraint
  -- matching the ON CONFLICT specification" for every real friend
  -- request - verified empirically against staging before this migration
  -- (a bare INSERT with the same clause fails identically; adding the
  -- WHERE clause resolves it). Since the raised exception propagates out
  -- of this AFTER INSERT trigger, it aborted the entire enclosing
  -- send_friend_request() transaction too, not just the notification -
  -- friend requests have very likely never actually succeeded through
  -- this path since 3E shipped. Fixed here because this exact function is
  -- already being modified for the 3H preference guard above, and 3H's
  -- own suppression behavior can't be verified against a foundation that
  -- can't successfully insert a notification in the first place.
  insert into notifications (recipient_id, type, friendship_id)
  values (new.addressee_id, 'friend_request_received', new.id)
  on conflict (recipient_id, friendship_id, type) where friendship_id is not null do nothing;
  return new;
end;
$$;

revoke all on function public.notify_friend_request() from public, anon, authenticated;

create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from user_preferences
    where user_id = new.requester_id and notify_friend_events = false
  ) then
    return new;
  end if;

  -- Same pre-existing 3E ON CONFLICT/partial-index mismatch as
  -- notify_friend_request() above - same fix, same reasoning.
  insert into notifications (recipient_id, type, friendship_id)
  values (new.requester_id, 'friend_request_accepted', new.id)
  on conflict (recipient_id, friendship_id, type) where friendship_id is not null do nothing;
  return new;
end;
$$;

revoke all on function public.notify_friend_accepted() from public, anon, authenticated;

-- ============ DISCOVERABILITY: search_profiles() ============
-- Additive WHERE clause only - every other line (including the caller's
-- own relationship resolution) is byte-identical to the 3E original. A
-- legacy caller with no user_preferences row (default: discoverable) is
-- unaffected by the coalesce below.

create or replace function public.search_profiles(p_query text)
returns table(
  id uuid, name text, avg_rating numeric, rating_count integer, relationship text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.id, p.name,
    (select round(avg(score), 1) from ratings where reviewee_id = p.id),
    (select count(*)::int from ratings where reviewee_id = p.id),
    coalesce((
      select case
        when f.status = 'accepted' then 'friends'
        when f.status = 'pending' and f.requester_id = auth.uid() then 'pending_outgoing'
        when f.status = 'pending' and f.addressee_id = auth.uid() then 'pending_incoming'
      end
      from friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = p.id)
         or (f.addressee_id = auth.uid() and f.requester_id = p.id)
    ), 'none')
  from profiles p
  where p.id <> auth.uid()
    and coalesce((select up.discoverable from user_preferences up where up.user_id = p.id), true)
    and p.name ilike '%' || trim(p_query) || '%'
  order by p.name
  limit 10;
$$;

revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_table_privilege('anon', 'user_preferences', 'SELECT');
--   select has_table_privilege('anon', 'user_preferred_points', 'SELECT');
--   select has_table_privilege('authenticated', 'user_preferred_points', 'UPDATE');
-- Expect true:
--   select has_table_privilege('authenticated', 'user_preferences', 'SELECT');
--   select has_table_privilege('authenticated', 'user_preferences', 'INSERT');
--   select has_table_privilege('authenticated', 'user_preferences', 'UPDATE');
--   select has_table_privilege('authenticated', 'user_preferred_points', 'SELECT');
--   select has_table_privilege('authenticated', 'user_preferred_points', 'INSERT');
--   select has_table_privilege('authenticated', 'user_preferred_points', 'DELETE');
-- Manual checks (see spec §16):
--   a legacy account (no preferences row) still appears in search_profiles
--     and still receives every notification type.
--   notify_chat_messages = false -> zero new_chat_message rows for a real
--     chat message to that user.
--   notify_friend_events = false -> zero friend_request_received rows for
--     a real friend request to that user; order-lifecycle notifications
--     for the same user are completely unaffected.
--   discoverable = false -> that profile no longer appears in
--     search_profiles for a stranger, but remains visible to an existing
--     friend/order counterpart via their own unrelated, unchanged
--     policies.
