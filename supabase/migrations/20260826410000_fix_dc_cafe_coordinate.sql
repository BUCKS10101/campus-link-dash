-- Phase 3A-2: correct "DC Cafe" to the confirmed Google Maps coordinate.
--
-- Source: Google Maps, supplied directly by the project owner (verified
-- real-world listing: "DC Bakery", inside VIT University campus).
-- Point: DC Cafe / Latitude 12.9700697 / Longitude 79.1588878
--   Corrects the previously seeded value (12.9703649, 79.1596033, ~84m
--   away) - the owner confirmed this new value should be used. Per
--   explicit owner instruction, "DC Bakery" is NOT added as a display
--   alias - the app-facing name stays "DC Cafe" only, unconditionally,
--   same rule as PHASE3_3A_LOCATION_SPEC.md §13 already stated.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9700697, lng = 79.1588878 where key = 'dc-cafe';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'dc-cafe'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
