-- Phase 3A-2: refine Men's Hostel L's coordinate.
--
-- Source: supplied directly by the project owner.
-- Point: Men's Hostel L / Latitude 12.972825818964964 / Longitude 79.16267065377032
--   Corrects the previously seeded value (12.9727623, 79.1623961, ~30m
--   away) - same building, refined coordinate.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.972825818964964, lng = 79.16267065377032 where key = 'hostel-mens-l';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'hostel-mens-l'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
