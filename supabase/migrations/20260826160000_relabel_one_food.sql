-- Phase 3A-2 follow-up: the 'one-food' campus_points row's label was left
-- as "One Food" when 20260826150000_campus_catalog_expansion.sql updated
-- every other alias (Campus Store -> Balaji Store, etc.) - a gap against
-- PHASE3_3A_LOCATION_SPEC.md §9/§12, which already documents the
-- app-facing name as "One Food World". Key stays 'one-food' (unchanged),
-- label-only fix.
--
-- STATUS: applied to STAGING only (wemjskpbulebxgyhyhmk).

update campus_points set label = 'One Food World' where key = 'one-food';
