-- Phase 3A-2: correct "TT" (Technology Tower, core building) to the
-- confirmed coordinate.
--
-- Source: supplied directly by the project owner.
-- Point: TT (Techno Tower) / Latitude 12.971015101308465 / Longitude 79.1594605952797
--   Corrects the previously seeded value (12.9700902, 79.1579793, ~190m
--   away, given earlier this session) - the owner confirmed this new
--   value should be used.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.971015101308465, lng = 79.1594605952797 where key = 'tt-block';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'tt-block'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
