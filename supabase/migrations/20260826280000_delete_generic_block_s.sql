-- Phase 3A-2: remove the generic "Block S" placeholder row, per explicit
-- project-owner instruction.
--
-- Context: Ladies Hostel S (hostel-ladies-s) is now seeded with its own
-- confirmed coordinate. The owner reviewed the remaining unconfirmed-wing
-- "Annex/Other" rows and explicitly said to keep 'hostel-block-h' and
-- 'hostel-block-j' as-is, but delete 'hostel-block-s' (I and O were
-- already deleted in the delete_empty_hostel_blocks migration this pass).
--
-- Untouched: hostel-block-b/d/e/f/g/h/j/n/p/t, hostel-mens-*,
-- hostel-ladies-* - none of these are affected by this migration.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

delete from campus_points
where key = 'hostel-block-s';
