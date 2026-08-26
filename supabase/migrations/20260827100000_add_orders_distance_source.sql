-- Phase 3B: persist whether an order's distance_km is a real routed
-- distance, a straight-line fallback, or was never resolved at all - see
-- PHASE3_3B_NEARBY_DISCOVERY_SPEC.md §5.
--
-- ROOT PROBLEM: compute_walking_route()/compute_walking_route_custom()
-- already distinguish a real routed result (populated LineString) from a
-- straight-line fallback (geometry: null) at the moment PostRequest.tsx
-- calls them, but that distinction was never persisted - orders.distance_km
-- is just a plain number, so nothing on the row says which kind of number
-- it is. Reconstructing it after the fact isn't reliable (graph
-- connectivity can change, as it did earlier this session), so this is
-- captured once, at creation time, the same way distance_km itself
-- already is.
--
-- Nullable and additive: every existing (legacy/pre-3B) order keeps
-- distance_source = null, meaning "unresolved" - never guessed/backfilled.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

alter table orders add column if not exists distance_source text
  check (distance_source in ('routed', 'fallback', 'unresolved'));

-- orders' SELECT privilege is column-scoped, not table-level (see
-- 20260825090000_fix_otp_column_privileges.sql and the follow-up
-- 20260826290000_grant_select_new_order_location_columns.sql that had to
-- patch this same gap for pickup_point_id/delivery_point_id/custom_delivery_*).
-- Without this explicit grant, Home would 42501 the instant it selects
-- this column - the exact incident that broke /my-orders earlier this
-- session. No other privilege, RLS policy, or OTP protection is touched.
grant select (distance_source) on orders to anon, authenticated;
