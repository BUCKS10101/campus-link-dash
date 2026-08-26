-- Phase 3A-2: correct "One Food World" to the confirmed coordinate.
--
-- Source: supplied directly by the project owner.
-- Point: One Food World / Latitude 12.9729273 / Longitude 79.1576229
--   Corrects the previously seeded value (12.9762191, 79.1617006, ~570m
--   away - not a rounding difference) - the owner confirmed this new
--   value is the real location.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9729273, lng = 79.1576229 where key = 'one-food';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'one-food'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
