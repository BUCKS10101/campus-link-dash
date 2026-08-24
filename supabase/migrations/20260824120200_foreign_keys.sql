-- Phase 1B: foreign keys.
--
-- REWRITTEN after checking pg_constraint against the live database on
-- 2026-08-24: every FK this file originally tried to add already exists
-- live (just under the real column names - orders.requester_id, not
-- customer_id; friendships.requester_id/addressee_id, not
-- user_id/friend_id):
--
--   orders_requester_id_fkey       orders.requester_id -> profiles(id)
--   orders_deliverer_id_fkey       orders.deliverer_id -> profiles(id)
--   chat_messages_order_id_fkey    chat_messages.order_id -> orders(id)
--   chat_messages_sender_id_fkey   chat_messages.sender_id -> profiles(id)
--   friendships_requester_id_fkey  friendships.requester_id -> profiles(id)
--   friendships_addressee_id_fkey  friendships.addressee_id -> profiles(id)
--
-- So this file is now a no-op / verification pass, not a real change -
-- every ALTER below hits the DO block's duplicate_object handler and does
-- nothing. It's kept (a) as a record of what's expected to exist, so a
-- missing one surfaces loudly by actually being added, and (b) because
-- none of the existing FKs specify ON DELETE CASCADE/SET NULL (they're
-- plain NO ACTION) - deliberately NOT changed here, since altering an
-- already-live constraint's delete behavior is a real behavioral change
-- to production schema that wasn't asked for and should be a separate,
-- explicit decision, not a side effect of "add missing FKs."
--
-- The one genuinely-missing FK - profiles.id -> auth.users(id) - is
-- intentionally NOT in this file. See
-- 20260824120250_profiles_auth_users_fk.sql for why it's split out.
--
-- STATUS: prepared in the repo, NOT verified applied to any live Supabase
-- project by this change.

do $$
begin
  alter table orders
    add constraint orders_requester_id_fkey
    foreign key (requester_id) references profiles(id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table orders
    add constraint orders_deliverer_id_fkey
    foreign key (deliverer_id) references profiles(id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table chat_messages
    add constraint chat_messages_order_id_fkey
    foreign key (order_id) references orders(id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table chat_messages
    add constraint chat_messages_sender_id_fkey
    foreign key (sender_id) references profiles(id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table friendships
    add constraint friendships_requester_id_fkey
    foreign key (requester_id) references profiles(id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table friendships
    add constraint friendships_addressee_id_fkey
    foreign key (addressee_id) references profiles(id);
exception
  when duplicate_object then null;
end $$;
