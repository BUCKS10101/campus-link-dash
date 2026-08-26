-- Phase 3A-2: refine Men's Hostel R's coordinate.
--
-- Source: Google Maps, supplied directly by the project owner.
-- Point: Men's Hostel R (also known locally as "Kalaignar M. Karunanidhi
-- Block", not used as a display alias per owner instruction)
-- Latitude: 12.9732649
-- Longitude: 79.1633352
--   Corrects the previously seeded value (12.9731082, 79.1633293, ~18m
--   away) - same building, refined coordinate.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9732649, lng = 79.1633352 where key = 'hostel-mens-r';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'hostel-mens-r'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
