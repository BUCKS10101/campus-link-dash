-- Phase 3E follow-up: grant SELECT on the new notifications.friendship_id column.
--
-- CONFIRMED LIVE (2026-08-28): after 20260828100000_social_graph.sql
-- added notifications.friendship_id, any query touching that column
-- (even just in a WHERE clause) failed with "permission denied for
-- table notifications" for authenticated. Root cause: 3C's original
-- migration (20260827200000_notifications.sql) granted SELECT on an
-- explicit column list - id, recipient_id, type, order_id, read_at,
-- created_at - which obviously couldn't include a column that didn't
-- exist yet. A newly ALTERed-in column inherits no privilege
-- automatically; it needs its own explicit grant, same lesson as
-- 20260826290000_grant_select_new_order_location_columns.sql for
-- orders' pickup/delivery columns.
--
-- No UPDATE grant added: friendship_id is only ever set by the
-- notify_friend_request()/notify_friend_accepted() triggers (SECURITY
-- DEFINER), never by a client write - authenticated already only has
-- UPDATE on read_at (3C), which stays exactly as-is.

grant select (friendship_id) on notifications to authenticated;
