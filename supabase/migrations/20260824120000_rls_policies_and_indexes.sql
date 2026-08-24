-- Phase 1B: Row-Level Security + indexes.
--
-- REWRITTEN after the first apply attempt failed: this file originally
-- assumed orders.customer_id / profiles.full_name / friendships.user_id,
-- none of which exist on the live database. Verified against the live
-- schema (information_schema.columns + pg_constraint + pg_policies) on
-- 2026-08-24 before rewriting - see the Phase 1B schema-mismatch report
-- for the full comparison. Live columns actually used below:
--   orders(requester_id, deliverer_id, status, ...)
--   friendships(requester_id, addressee_id, status, ...)  -- addressee_id
--     and status exist on the table but are NOT used by any policy below;
--     see the FRIENDSHIPS section for why.
--   chat_messages(order_id, sender_id, ...)  -- no sender_type column
--   profiles(id, ...)  -- no is_deliverer/full_name/friend_count columns
--
-- STATUS: prepared in the repo, NOT verified applied to any live Supabase
-- project by this change. Confirmed via pg_class.relrowsecurity that RLS
-- is currently OFF on all four tables and pg_policies is empty, so this
-- is a clean slate, not a partial-apply to reconcile.
--
-- Every CREATE POLICY is preceded by DROP POLICY IF EXISTS so this file
-- can be re-run safely (e.g. after a partial failure) without erroring on
-- "policy already exists". ALTER TABLE ... ENABLE ROW LEVEL SECURITY is
-- idempotent already (Postgres no-ops if it's already on).
--
-- Without this, every table is fully readable/writable by any signed-in
-- (or anonymous, depending on API key) client, since nothing in the app
-- talks to the DB with elevated privileges.

-- ============ PROFILES ============
alter table profiles enable row level security;

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

-- deliverers need to see the requester's name/phone on orders they accept,
-- and requesters need to see the deliverer's - so also allow reading a
-- profile if you share an order with that user.
drop policy if exists "profiles_select_order_counterparty" on profiles;
create policy "profiles_select_order_counterparty"
  on profiles for select
  using (
    id in (
      select requester_id from orders where deliverer_id = auth.uid()
      union
      select deliverer_id from orders where requester_id = auth.uid()
    )
  );

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
  on profiles for insert
  with check (auth.uid() = id);

-- ============ ORDERS ============
alter table orders enable row level security;

drop policy if exists "orders_select_participant" on orders;
create policy "orders_select_participant"
  on orders for select
  using (auth.uid() = requester_id or auth.uid() = deliverer_id);

-- pending orders need to be visible to everyone browsing the home feed,
-- not just the requester who posted them
drop policy if exists "orders_select_pending_feed" on orders;
create policy "orders_select_pending_feed"
  on orders for select
  using (status = 'pending');

drop policy if exists "orders_insert_own" on orders;
create policy "orders_insert_own"
  on orders for insert
  with check (auth.uid() = requester_id);

-- deliverer accepting: only allowed to claim a still-pending, unassigned order
drop policy if exists "orders_update_accept" on orders;
create policy "orders_update_accept"
  on orders for update
  using (status = 'pending' and deliverer_id is null)
  with check (deliverer_id = auth.uid());

-- deliverer progressing an order they're already assigned to
drop policy if exists "orders_update_assigned_deliverer" on orders;
create policy "orders_update_assigned_deliverer"
  on orders for update
  using (auth.uid() = deliverer_id)
  with check (auth.uid() = deliverer_id);

-- ============ CHAT MESSAGES ============
alter table chat_messages enable row level security;

drop policy if exists "chat_select_participant" on chat_messages;
create policy "chat_select_participant"
  on chat_messages for select
  using (
    order_id in (
      select id from orders
      where requester_id = auth.uid() or deliverer_id = auth.uid()
    )
  );

-- no sender_type column exists on the live table, so unlike the original
-- draft this only checks who's allowed to post into the order's thread.
drop policy if exists "chat_insert_participant" on chat_messages;
create policy "chat_insert_participant"
  on chat_messages for insert
  with check (
    sender_id = auth.uid()
    and order_id in (
      select id from orders
      where requester_id = auth.uid() or deliverer_id = auth.uid()
    )
  );

-- ============ FRIENDSHIPS ============
-- Evidence-based, reviewed 2026-08-25. The ONLY runtime operation on this
-- table anywhere in the app's history (confirmed via a full git log
-- search, not just the current tree) is the read in useOrders.ts:
--   supabase.from('friendships').select('friend_id').eq('user_id', viewerId)
-- i.e. a one-directional read of "rows where I am the owner", used only to
-- filter the order feed. There is no insert, update, or delete on this
-- table anywhere in the codebase, past or present - no "add friend", no
-- accept/decline, no "unfriend" UI or handler exists. The app-level
-- Friendship type (src/lib/database-types.ts) doesn't even have a status
-- field, so the live schema's requester_id/addressee_id/status(default
-- 'pending') shape is schema-only intent with no code behind it yet.
--
-- So, deliberately narrow:
--   - SELECT: only the policy the existing code actually relies on
--     (requester_id = auth.uid(), the live-schema equivalent of the old
--     `user_id = viewer` read). Addressee-side access is NOT assumed -
--     nothing in the app ever reads from that side.
--   - INSERT/UPDATE/DELETE: intentionally NOT added. Friendship creation,
--     accept/decline, and deletion are unbuilt features, not just
--     unprotected ones - inventing policies for operations no code
--     performs would be guessing at a feature that doesn't exist yet.
--   - No pending -> accepted/declined lifecycle is assumed or enforced
--     here. That's a product decision to be made when this feature is
--     actually designed.
--
-- With RLS enabled and only a SELECT policy present, every write to this
-- table is blocked by default at the DB level (no policy grants
-- INSERT/UPDATE/DELETE to anyone). That doesn't break anything today -
-- nothing in the app writes to friendships - and it closes an actual gap
-- (an unauthenticated/unrelated client could otherwise write arbitrary
-- rows via the REST API) without pretending to implement a feature that
-- isn't built. Revisit this whole section when friend requests are
-- designed.
alter table friendships enable row level security;

drop policy if exists "friendships_select_participant" on friendships;
drop policy if exists "friendships_select_own" on friendships;
create policy "friendships_select_own"
  on friendships for select
  using (auth.uid() = requester_id);

-- ============ INDEXES ============
-- Every filter used by the app's order/chat/friendship queries scans
-- these columns. CREATE INDEX IF NOT EXISTS is idempotent.
create index if not exists orders_requester_id_idx on orders(requester_id);
create index if not exists orders_deliverer_id_idx on orders(deliverer_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_at_idx on orders(created_at desc);
create index if not exists chat_messages_order_id_idx on chat_messages(order_id);
-- Only requester_id is indexed: it's the only column the current SELECT
-- policy and the only real query filter on. An addressee_id index would
-- be speculative until that side of the feature is actually built.
create index if not exists friendships_requester_id_idx on friendships(requester_id);
