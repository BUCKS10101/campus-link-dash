-- Phase 3A-2: seed "MB" (MGR Building) and "GDN", and correct "Main Gate"
-- to the confirmed coordinate.
--
-- Source: supplied directly by the project owner.
-- Point: Main Gate / Latitude 12.9712123 / Longitude 79.1577843
--   Corrects the previously seeded value (12.968811, 79.155957, from
--   20260826170000_seed_main_gate_coordinate.sql) - the owner confirmed
--   that earlier value was wrong and this is the real coordinate.
-- Point: MB (MGR Building) / Latitude 12.9689001 / Longitude 79.1558853
-- Point: GDN / Latitude 12.9692627 / Longitude 79.154946
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9712123, lng = 79.1577843, active = true where key = 'main-gate';
update campus_points set lat = 12.9689001, lng = 79.1558853, active = true where key = 'mb';
update campus_points set lat = 12.9692627, lng = 79.154946, active = true where key = 'gdn';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key in ('main-gate', 'mb', 'gdn') and cp2.lat is not null
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
