-- Phase 3E: social graph / friends - see PHASE3_3E_SOCIAL_GRAPH_SPEC.md.
--
-- The friendships table already exists (baseline schema) but has never
-- been written to (0 rows on staging, confirmed live) and has no
-- write policy at all - this migration is additive constraints/indexes/
-- policies over the existing shape, not a rewrite. REVOKE-before-GRANT
-- from the start (3C/3D's own lesson).

-- ============ FRIENDSHIPS: constraints + indexes ============

do $$
begin
  alter table friendships add constraint friendships_no_self_friend
    check (requester_id <> addressee_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table friendships add constraint friendships_status_check
    check (status in ('pending', 'accepted'));
exception
  when duplicate_object then null;
end $$;

-- One row per unordered pair, ever - makes A->B + B->A, or two identical
-- A->B rows, structurally impossible (see spec §2).
create unique index if not exists friendships_canonical_pair_idx
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- requester_id already had an index; addressee-side lookups ("requests
-- I've received") had none.
create index if not exists friendships_addressee_id_idx on friendships (addressee_id);

-- ============ FRIENDSHIPS: RLS ============

drop policy if exists "friendships_select_own" on friendships;
drop policy if exists "friendships_select_participant" on friendships;
create policy "friendships_select_participant"
  on friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

revoke all on friendships from anon, authenticated;
grant select on friendships to authenticated;
-- No insert/update/delete grant to any client role - the only write
-- path is the five RPCs below.

-- ============ PROFILES: one more counterparty policy ============
-- A notification recipient (or /friends page) needs to see the name of
-- the OTHER participant on a friendships row - existing profiles RLS
-- only covers self and order-counterparties, not friendship-counterparties.
-- Mirrors profiles_select_order_counterparty's exact shape. No new
-- information is exposed beyond what search_profiles() already returns
-- for a stranger - both sides of a friendships row already identified
-- each other to create it.

drop policy if exists "profiles_select_friendship_counterparty" on profiles;
create policy "profiles_select_friendship_counterparty"
  on profiles for select
  using (
    id in (
      select addressee_id from friendships where requester_id = auth.uid()
      union
      select requester_id from friendships where addressee_id = auth.uid()
    )
  );

-- ============ WRITE PATH: five SECURITY DEFINER RPCs ============
-- Same shape as 3D's submit_rating(): the caller's identity always
-- comes from auth.uid(), never a client-supplied parameter. Unlike 3C's
-- triggers, these ARE meant to be called directly by the client.

create or replace function public.send_friend_request(p_addressee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_addressee_id = auth.uid() then
    raise exception 'You cannot send yourself a friend request';
  end if;

  insert into friendships (requester_id, addressee_id, status)
  values (auth.uid(), p_addressee_id, 'pending')
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'A relationship with this student already exists';
end;
$$;

create or replace function public.accept_friend_request(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row friendships%rowtype;
begin
  select * into v_row from friendships where id = p_friendship_id;
  if not found or v_row.addressee_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  update friendships set status = 'accepted' where id = p_friendship_id;
end;
$$;

create or replace function public.decline_friend_request(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row friendships%rowtype;
begin
  select * into v_row from friendships where id = p_friendship_id;
  if not found or v_row.addressee_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  delete from friendships where id = p_friendship_id;
end;
$$;

create or replace function public.cancel_friend_request(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row friendships%rowtype;
begin
  select * into v_row from friendships where id = p_friendship_id;
  if not found or v_row.requester_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  delete from friendships where id = p_friendship_id;
end;
$$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row friendships%rowtype;
begin
  select * into v_row from friendships where id = p_friendship_id;
  if not found or auth.uid() not in (v_row.requester_id, v_row.addressee_id) then
    raise exception 'Friendship not found';
  end if;
  if v_row.status <> 'accepted' then
    raise exception 'You are not friends with this person';
  end if;

  delete from friendships where id = p_friendship_id;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.accept_friend_request(uuid) from public, anon;
revoke all on function public.decline_friend_request(uuid) from public, anon;
revoke all on function public.cancel_friend_request(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ============ SEARCH: search_profiles() ============
-- Bypasses the profiles-visibility gap for strangers the same way 3D's
-- get_profile_reputation() did - returns ONLY name + aggregate
-- reputation + the caller's real relationship, never email/phone/hostel.

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
    and p.name ilike '%' || trim(p_query) || '%'
  order by p.name
  limit 10;
$$;

revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- ============ NOTIFICATIONS: extend for friendship events ============
-- Additive/relaxing only - no existing order-related trigger, policy,
-- or column touched. 3C's own spec anticipated this exact need.

alter table notifications alter column order_id drop not null;
alter table notifications add column if not exists friendship_id uuid references friendships(id) on delete cascade;

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'order_accepted', 'order_picked_up', 'order_out_for_delivery',
    'order_delivered', 'new_chat_message',
    'friend_request_received', 'friend_request_accepted'
  ));

do $$
begin
  alter table notifications add constraint notifications_exactly_one_subject check (
    (order_id is not null and friendship_id is null) or
    (order_id is null and friendship_id is not null)
  );
exception
  when duplicate_object then null;
end $$;

-- The existing unique(recipient_id, order_id, type) can't dedup
-- friendship-scoped rows (order_id is null there, and NULL <> NULL for
-- uniqueness) - a separate partial constraint covers that scope only.
create unique index if not exists notifications_recipient_friendship_type_key
  on notifications (recipient_id, friendship_id, type)
  where friendship_id is not null;

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (recipient_id, type, friendship_id)
  values (new.addressee_id, 'friend_request_received', new.id)
  on conflict (recipient_id, friendship_id, type) do nothing;
  return new;
end;
$$;

revoke all on function public.notify_friend_request() from public, anon, authenticated;

drop trigger if exists friendships_notify_request on friendships;
create trigger friendships_notify_request
  after insert on friendships
  for each row
  execute function public.notify_friend_request();

create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (recipient_id, type, friendship_id)
  values (new.requester_id, 'friend_request_accepted', new.id)
  on conflict (recipient_id, friendship_id, type) do nothing;
  return new;
end;
$$;

revoke all on function public.notify_friend_accepted() from public, anon, authenticated;

drop trigger if exists friendships_notify_accepted on friendships;
create trigger friendships_notify_accepted
  after update on friendships
  for each row
  when (old.status = 'pending' and new.status = 'accepted')
  execute function public.notify_friend_accepted();

-- ============ VERIFY AFTER APPLYING ============
-- Expect false:
--   select has_table_privilege('anon', 'friendships', 'INSERT');
--   select has_table_privilege('authenticated', 'friendships', 'INSERT');
--   select has_function_privilege('anon', 'send_friend_request(uuid)', 'EXECUTE');
--   select has_function_privilege('anon', 'search_profiles(text)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'notify_friend_request()', 'EXECUTE');
-- Expect true:
--   select has_table_privilege('authenticated', 'friendships', 'SELECT');
--   select has_function_privilege('authenticated', 'send_friend_request(uuid)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'accept_friend_request(uuid)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'decline_friend_request(uuid)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'cancel_friend_request(uuid)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'remove_friend(uuid)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'search_profiles(text)', 'EXECUTE');
