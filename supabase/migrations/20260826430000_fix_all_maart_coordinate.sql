-- Phase 3A-2: refine "All Maart"'s coordinate.
--
-- Source: supplied directly by the project owner.
-- Point: All Maart / Latitude 12.97011422129549 / Longitude 79.15425672878584
--   Corrects the previously seeded value (12.9700963, 79.154349, ~10m
--   away) - same building, refined coordinate.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.97011422129549, lng = 79.15425672878584 where key = 'all-maart';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'all-maart'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
