-- Phase 3A: seed real coordinate for the "Campus Store" campus_points row.
--
-- Source: supplied directly by the project owner. Real-world identity
-- confirmed as "Balaji Bookstore, VIT" (Google Maps) - this is the
-- physical place behind the app's "Campus Store" pickup option, not a
-- separate/new point. Seeded onto the existing 'campus-store' key rather
-- than adding a new campus_points row or a new PostRequest.tsx option.
--
-- Point: Balaji Store / Balaji Bookstore, VIT
-- Latitude: 12.9714358
-- Longitude: 79.1596932
-- Source: Google Maps
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9714358, lng = 79.1596932, active = true where key = 'campus-store';
