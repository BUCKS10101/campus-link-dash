-- Phase 3A-2: remove the generic "Block D" placeholder row, per explicit
-- project-owner instruction (ambiguous now that both Men's Hostel D and
-- Ladies Hostel D exist as separate, confirmed rows for the same letter).
--
-- Untouched: hostel-mens-d, hostel-ladies-d - both stay exactly as they
-- are, this only removes the redundant/ambiguous unconfirmed-wing row.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

delete from campus_points
where key = 'hostel-block-d';
