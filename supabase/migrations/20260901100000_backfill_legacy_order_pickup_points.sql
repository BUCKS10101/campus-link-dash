-- Phase 3H follow-up: backfill pickup_point_id on pre-3A legacy orders.
--
-- Root cause of "GPS radius filter looks like it does nothing" reported
-- against real staging data: filterByProximity() (ranking.ts) correctly
-- never hides an order whose pickup_point_id is null - the same "don't
-- hide what can't be honestly measured" rule 3A/3B already apply to
-- routed-distance ranking, deliberately not new/changed here. But 10 of
-- 11 real pending orders in staging predate PostRequest.tsx setting
-- pickup_point_id at all, so they were unconditionally exempt from the
-- GPS filter - not a bug in the filter, a data gap in orders created
-- before that column was ever populated.
--
-- These three restaurant_name values are the exact pre-rename text
-- PostRequest.tsx wrote for these three pickup options before
-- 20260826150000_campus_catalog_expansion.sql/20260826160000_relabel_
-- one_food.sql relabeled the underlying campus_points rows - same place,
-- same campus_points.id, only the display label changed since. Verified
-- against those two migrations' own history before writing this one.
--
-- Scoped narrowly: only touches orders with pickup_point_id IS NULL and
-- an exact match on one of these three legacy names - never touches an
-- order that already has a pickup_point_id, and never guesses at any
-- other restaurant_name.
--
-- STATUS: applied to STAGING only (wemjskpbulebxgyhyhmk), never
-- production (kjsseqlmnmiuqepfmldh).

update orders
set pickup_point_id = (select id from campus_points where key = 'dc-cafe')
where restaurant_name = 'DC Cafe' and pickup_point_id is null;

update orders
set pickup_point_id = (select id from campus_points where key = 'one-food')
where restaurant_name = 'One Food' and pickup_point_id is null;

update orders
set pickup_point_id = (select id from campus_points where key = 'campus-store')
where restaurant_name = 'Campus Store' and pickup_point_id is null;
