-- Phase 3A-2: remove the never-coordinated generic "Block" placeholder
-- rows, per explicit project-owner instruction.
--
-- The owner confirmed the ladies-wing accommodation inventory is complete
-- (A-J plus S; see the hostel-ladies-* seed migrations in this pass) and
-- these remaining generic 'hostel-block-*' rows were never resolved to any
-- real building (lat/lng null, active = false since the original 3A seed)
-- and never will be - explicitly instructed to be deleted rather than
-- left as permanent dead placeholders.
--
-- Untouched: hostel-block-b/d/e/f/g/h/j/n/p/s/t, which DO have real
-- coordinates (unconfirmed-wing "Annex/Other" buildings, not ladies-wing
-- duplicates) and stay exactly as they are.
--
-- Safe to delete: these rows are inactive (active = false), so
-- campus_points_select_active never exposed them and no order could ever
-- have referenced them via delivery_point_id.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

delete from campus_points
where key in (
  'hostel-block-a',
  'hostel-block-c',
  'hostel-block-i',
  'hostel-block-k',
  'hostel-block-l',
  'hostel-block-m',
  'hostel-block-o',
  'hostel-block-q',
  'hostel-block-r'
)
and lat is null
and active = false;
