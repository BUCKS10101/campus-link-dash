-- Campus Link: Row-Level Security + indexes
--
-- SUPERSEDED as of Phase 1B: this file is kept for history only. The
-- authoritative, versioned source is now supabase/migrations/ - see
-- supabase/migrations/README.md for how to apply it. Do not run this file
-- against a project that has already run the migrations (it predates the
-- foreign-key, order-status-transition, and OTP-verification migrations
-- and would leave those gaps unpatched).
--
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Nothing in the app talks to the DB with elevated privileges, so without
-- these policies every table is fully readable/writable by any signed-in
-- (or anonymous, depending on your API key) client.

-- ============ PROFILES ============
alter table profiles enable row level security;

create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

-- deliverers need to see the customer's name/phone on orders they accept,
-- and customers need to see the deliverer's — so also allow reading a
-- profile if you share an order with that user.
create policy "profiles_select_order_counterparty"
  on profiles for select
  using (
    id in (
      select customer_id from orders where deliverer_id = auth.uid()
      union
      select deliverer_id from orders where customer_id = auth.uid()
    )
  );

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on profiles for insert
  with check (auth.uid() = id);

-- ============ ORDERS ============
alter table orders enable row level security;

create policy "orders_select_participant"
  on orders for select
  using (auth.uid() = customer_id or auth.uid() = deliverer_id);

-- pending orders need to be visible to everyone browsing the home feed,
-- not just the customer who posted them
create policy "orders_select_pending_feed"
  on orders for select
  using (status = 'pending');

create policy "orders_insert_own"
  on orders for insert
  with check (auth.uid() = customer_id);

-- deliverer accepting: only allowed to claim a still-pending order
create policy "orders_update_accept"
  on orders for update
  using (status = 'pending' and deliverer_id is null)
  with check (deliverer_id = auth.uid());

-- deliverer progressing an order they're already assigned to
create policy "orders_update_assigned_deliverer"
  on orders for update
  using (auth.uid() = deliverer_id)
  with check (auth.uid() = deliverer_id);

-- ============ CHAT MESSAGES ============
alter table chat_messages enable row level security;

create policy "chat_select_participant"
  on chat_messages for select
  using (
    order_id in (
      select id from orders
      where customer_id = auth.uid() or deliverer_id = auth.uid()
    )
  );

create policy "chat_insert_participant"
  on chat_messages for insert
  with check (
    sender_id = auth.uid()
    and order_id in (
      select id from orders
      where customer_id = auth.uid() or deliverer_id = auth.uid()
    )
  );

-- ============ FRIENDSHIPS ============
alter table friendships enable row level security;

create policy "friendships_select_own"
  on friendships for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "friendships_insert_own"
  on friendships for insert
  with check (auth.uid() = user_id);

create policy "friendships_delete_own"
  on friendships for delete
  using (auth.uid() = user_id);

-- ============ INDEXES ============
-- Every filter used by useOrders.ts / useChat.ts scans these columns.
create index if not exists orders_customer_id_idx on orders(customer_id);
create index if not exists orders_deliverer_id_idx on orders(deliverer_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_at_idx on orders(created_at desc);
create index if not exists chat_messages_order_id_idx on chat_messages(order_id);
create index if not exists friendships_user_id_idx on friendships(user_id);
create index if not exists friendships_friend_id_idx on friendships(friend_id);

-- ============ DATA INTEGRITY ============
alter table orders
  add constraint orders_status_check
  check (status in ('pending', 'accepted', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'));
