-- Phase 3A-2: refine Men's Hostel Q's coordinate.
--
-- Source: Google Maps, supplied directly by the project owner.
-- Point: Men's Hostel Q (also known locally as "Vajpayee Block Hostel",
-- not used as a display alias, same treatment as Men's Hostel R's
-- "Kalaignar M. Karunanidhi Block" note in this same batch)
-- Latitude: 12.9737816
-- Longitude: 79.1639856
--   Corrects the previously seeded value (12.973882, 79.163952, ~13m
--   away) - same building, refined coordinate.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9737816, lng = 79.1639856 where key = 'hostel-mens-q';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'hostel-mens-q'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
