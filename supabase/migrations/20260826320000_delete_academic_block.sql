-- Phase 3A-2: remove the never-coordinated "Academic Block" placeholder
-- row, per explicit project-owner instruction.
--
-- This was the last remaining unresolved point in the entire catalog
-- (PHASE3_3A_LOCATION_SPEC.md §11). It never had a coordinate (lat/lng
-- null, active = false since the original seed) and never will -
-- explicitly instructed to be removed rather than left as a permanent
-- dead placeholder, same treatment as the earlier hostel-block-*
-- deletions this pass.
--
-- Safe to delete: the row is inactive (active = false), so
-- campus_points_select_active never exposed it and no order could ever
-- have referenced it via delivery_point_id/pickup_point_id.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

delete from campus_points
where key = 'academic-block'
and lat is null
and active = false;
