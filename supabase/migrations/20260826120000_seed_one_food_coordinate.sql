-- Phase 3A: seed real coordinate for the "One Food" campus_points row.
--
-- Source: supplied directly by the project owner ("One Food World",
-- 12.9762191, 79.1617006) - not searched/derived. This is the first of the
-- 3 restaurant pickup points to get a real coordinate; DC Cafe and Campus
-- Store remain unseeded (inactive, null) until their coordinates are
-- likewise supplied or verified.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9762191, lng = 79.1617006, active = true where key = 'one-food';
