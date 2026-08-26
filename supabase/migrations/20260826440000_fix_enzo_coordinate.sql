-- Phase 3A-2: refine "Enzo"'s coordinate.
--
-- Source: supplied directly by the project owner.
-- Point: Enzo / Latitude 12.972550416858027 / Longitude 79.15890608493197
--   Corrects the previously seeded value (12.9724576, 79.1588679, ~11m
--   away) - same building, refined coordinate.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.972550416858027, lng = 79.15890608493197 where key = 'enzo';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'enzo'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
