-- Phase 3A-2: refine Men's Hostel N's coordinate.
--
-- Source: Google Maps, supplied directly by the project owner.
-- Point: Men's Hostel N (also known locally as "N Block General Store" /
-- "N Block", not used as a display alias, same treatment as Men's Hostel
-- Q/R's local-name notes in this same batch)
-- Latitude: 12.975144
-- Longitude: 79.1639319
--   Corrects the previously seeded value (12.975105, 79.163701, ~25m
--   away) - same building, refined coordinate. Unrelated to the
--   pre-existing 'hostel-block-n' row (Annex/Other, ~830m away, a
--   genuinely different building) - untouched.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.975144, lng = 79.1639319 where key = 'hostel-mens-n';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'hostel-mens-n'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
