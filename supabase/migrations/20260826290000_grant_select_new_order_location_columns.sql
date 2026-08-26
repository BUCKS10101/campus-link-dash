-- Phase 3A-2 hotfix: grant SELECT on five orders columns added by earlier
-- 3A migrations that were never added to the Phase 1B column-privilege
-- allowlist.
--
-- ROOT CAUSE: supabase/migrations/20260825090000_fix_otp_column_privileges.sql
-- narrowed `orders` SELECT for anon/authenticated to a fixed 10-column
-- list. Three later 3A migrations then added new columns to `orders`
-- (20260826100000_campus_points.sql: delivery_point_id;
-- 20260826110000_campus_points_3a_review.sql: pickup_point_id;
-- 20260826150000_campus_catalog_expansion.sql: custom_delivery_lat/lng/
-- note) without extending that allowlist. Once src/hooks/useOrders.ts
-- started selecting those columns (3A-2), every orders query failed with
-- "permission denied for table orders" - Postgres denies the whole
-- SELECT when it references any column outside the caller's privilege
-- and there's no covering table-level grant.
--
-- SCOPE: additive only. Grants SELECT on exactly the 5 missing columns to
-- anon and authenticated, mirroring the existing grant's role symmetry.
-- Does NOT touch: RLS policies, otp privileges (SELECT/UPDATE/INSERT),
-- UPDATE privileges, INSERT privileges, or anything else the Phase 1B
-- migration (20260825090000) set up - that migration is not modified.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

grant select (
  pickup_point_id, delivery_point_id,
  custom_delivery_lat, custom_delivery_lng, custom_delivery_note
) on orders to anon, authenticated;
