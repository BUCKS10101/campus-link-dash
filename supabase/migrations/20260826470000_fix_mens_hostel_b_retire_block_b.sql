-- Phase 3A-2: correct Men's Hostel B to the confirmed coordinate, and
-- retire the now-redundant generic "Block B" row.
--
-- Source: supplied directly by the project owner.
-- Point: Men's Hostel B (was "B Block") / Latitude 12.974364414540558 / Longitude 79.15749180953112
--
-- The owner confirmed the generic 'hostel-block-b' row (Annex/Other,
-- unconfirmed wing) and 'hostel-mens-b' (seeded earlier this session at
-- 12.9739175, 79.1576353, ~52m away) are the SAME physical building -
-- Block B is the men's wing. Resolved the same way as Block E earlier
-- this session: update hostel-mens-b to the new confirmed coordinate and
-- delete hostel-block-b, rather than keeping two rows for one building.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.974364414540558, lng = 79.15749180953112 where key = 'hostel-mens-b';

delete from campus_points where key = 'hostel-block-b';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'hostel-mens-b'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
