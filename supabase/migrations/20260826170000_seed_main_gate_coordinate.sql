-- Phase 3A-2 follow-up: seed real coordinate for the "Main Gate" campus_points row.
--
-- Source: supplied directly by the project owner.
-- Point: Main Gate
-- Latitude: 12.968811
-- Longitude: 79.155957
--
-- Also snaps the point into the campus footpath graph, same pattern as
-- every other coordinate seed in this project.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.968811, lng = 79.155957, active = true where key = 'main-gate';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'main-gate' and cp2.lat is not null
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
