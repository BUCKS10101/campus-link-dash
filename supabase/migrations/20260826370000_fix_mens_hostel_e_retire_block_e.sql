-- Phase 3A-2: correct Men's Hostel E to the confirmed coordinate, and
-- retire the now-redundant generic "Block E" row.
--
-- Source: Google Maps, supplied directly by the project owner.
-- Point: Men's Hostel E (was "E Block") / Latitude 12.9729553 / Longitude 79.1597987
--
-- The owner confirmed the generic 'hostel-block-e' row (Annex/Other,
-- unconfirmed wing) and 'hostel-mens-e' (seeded earlier this session at
-- 12.972649, 79.159782, ~70m away) are the SAME physical building - Block
-- E is the men's wing. Resolved by updating hostel-mens-e to the new
-- confirmed coordinate and deleting hostel-block-e, rather than keeping
-- two rows for one building.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9729553, lng = 79.1597987 where key = 'hostel-mens-e';

delete from campus_points where key = 'hostel-block-e';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'hostel-mens-e'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
