-- Phase 3A-2: seed the real, physically distinct "Ladies Hostel G",
-- "Ladies Hostel H", and "Ladies Hostel J" locations.
--
-- Source: supplied directly by the project owner.
-- Point: Ladies Hostel G / Ladies Hostel H / Ladies Hostel J
-- Latitude: 12.9684713
-- Longitude: 79.1587524
--
-- The three buildings share one entrance (confirmed by the project
-- owner), so all three points intentionally resolve to the same
-- coordinate - not a data error, not a guess. New rows, not a reuse of
-- the existing 'hostel-block-g' / 'hostel-block-h' / 'hostel-block-j'
-- rows (those are separate, unconfirmed-wing blocks seeded earlier - see
-- PHASE3_3A_LOCATION_SPEC.md §9a - and are untouched by this migration).
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, wing, lat, lng, active)
values
  ('hostel-ladies-g', 'Ladies Hostel G', 'accommodation', 'ladies', 12.9684713, 79.1587524, true),
  ('hostel-ladies-h', 'Ladies Hostel H', 'accommodation', 'ladies', 12.9684713, 79.1587524, true),
  ('hostel-ladies-j', 'Ladies Hostel J', 'accommodation', 'ladies', 12.9684713, 79.1587524, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key in ('hostel-ladies-g', 'hostel-ladies-h', 'hostel-ladies-j')
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
