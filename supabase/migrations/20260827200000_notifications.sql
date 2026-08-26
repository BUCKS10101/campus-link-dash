-- Phase 3C: notifications - see PHASE3_3C_NOTIFICATIONS_SPEC.md.
--
-- Additive only: one new table, two new SECURITY DEFINER trigger
-- functions, two new triggers. Does not touch orders/chat_messages RLS,
-- does not alter any existing policy, grant, or trigger.
--
-- STATUS: prepared in the repo. Apply to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

-- ============ TABLE ============

create table if not exists notifications (
  id uuid not null default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in (
    'order_accepted', 'order_picked_up', 'order_out_for_delivery',
    'order_delivered', 'new_chat_message'
  )),
  order_id uuid not null references orders(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_recipient_order_type_key
    unique (recipient_id, order_id, type)
);

create index if not exists notifications_recipient_unread_idx
  on notifications (recipient_id, read_at);

create index if not exists notifications_recipient_created_idx
  on notifications (recipient_id, created_at desc);

-- ============ RLS ============
-- A user may read and mark-read only their own rows. No insert or delete
-- policy exists for any client role, and no insert/delete grant is given
-- below - the only way a row is ever created is through the two
-- SECURITY DEFINER trigger functions below, which run outside RLS/grants
-- entirely (see the note above verify_notifications_privileges).

alter table notifications enable row level security;

drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own"
  on notifications for select
  using (auth.uid() = recipient_id);

drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own"
  on notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Explicit column-level grants (this project's orders table has already
-- shown that Supabase does not always apply a usable table-level grant
-- by default - see 20260825090000_fix_otp_column_privileges.sql). Select
-- and update only; deliberately no insert, no delete, to any role.
grant select (id, recipient_id, type, order_id, read_at, created_at)
  on notifications to authenticated;
grant update (read_at) on notifications to authenticated;

-- ============ TRIGGER FUNCTIONS ============
-- Both are SECURITY DEFINER so they can write into notifications despite
-- authenticated having no insert grant on it at all. Both:
--   - set an explicit search_path (public, pg_temp) so no attacker-
--     controlled schema/object earlier in a session-level search_path
--     can be resolved instead of the real orders/notifications tables.
--   - are revoked from public and NOT granted execute to anon/authenticated
--     - they are only ever invoked implicitly by their trigger, never
--     callable directly by a client. A client cannot create a
--     notification by calling these functions any more than by a raw
--     insert.
--   - do not accept or trust any client-supplied recipient - the
--     recipient is always derived from the already-committed
--     orders/chat_messages row itself.

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
begin
  v_type := case new.status
    when 'accepted' then 'order_accepted'
    when 'picked_up' then 'order_picked_up'
    when 'out_for_delivery' then 'order_out_for_delivery'
    when 'delivered' then 'order_delivered'
    else null
  end;

  if v_type is null then
    return new;
  end if;

  insert into notifications (recipient_id, type, order_id)
  values (new.requester_id, v_type, new.id)
  on conflict (recipient_id, order_id, type) do nothing;

  return new;
end;
$$;

revoke all on function public.notify_order_status_change() from public;

drop trigger if exists orders_notify_status_change on orders;
create trigger orders_notify_status_change
  after update on orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_order_status_change();

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

  insert into notifications (recipient_id, type, order_id, created_at, read_at)
  values (v_recipient, 'new_chat_message', new.order_id, now(), null)
  on conflict (recipient_id, order_id, type)
  do update set created_at = now(), read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_new_chat_message() from public;

drop trigger if exists chat_messages_notify_new_message on chat_messages;
create trigger chat_messages_notify_new_message
  after insert on chat_messages
  for each row
  execute function public.notify_new_chat_message();
