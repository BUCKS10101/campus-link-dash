-- Phase 3A-2: correct "Balaji Store" to the confirmed Google Maps coordinate.
--
-- Source: Google Maps, supplied directly by the project owner.
-- Point: Balaji Store / Latitude 12.9711421 / Longitude 79.1601536
--   Corrects the previously seeded value (12.9714358, 79.1596932, ~60m
--   away, originally cross-checked against OSM) - the owner confirmed
--   this new value should be used instead.
--
-- Stable key 'campus-store' is unchanged (see PHASE3_3A_LOCATION_SPEC.md
-- §13 - historical orders reference it by id, and the display label
-- "Balaji Store" is a separate, already-applied concern from this
-- coordinate correction).
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9711421, lng = 79.1601536 where key = 'campus-store';

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'campus-store'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
