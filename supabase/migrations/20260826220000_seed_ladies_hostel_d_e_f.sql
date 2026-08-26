-- Phase 3A-2: seed the real, physically distinct "Ladies Hostel D",
-- "Ladies Hostel E", and "Ladies Hostel F" locations.
--
-- Source: supplied directly by the project owner.
-- Point: Ladies Hostel D / Ladies Hostel E / Ladies Hostel F
-- Latitude: 12.9708674
-- Longitude: 79.16112
--
-- The three buildings share one entrance (confirmed by the project
-- owner), so all three points intentionally resolve to the same
-- coordinate - not a data error, not a guess. New rows, not a reuse of
-- the existing 'hostel-block-d' / 'hostel-block-e' / 'hostel-block-f'
-- rows (those are separate, unconfirmed-wing blocks seeded earlier - see
-- PHASE3_3A_LOCATION_SPEC.md §9a - and are untouched by this migration).
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, wing, lat, lng, active)
values
  ('hostel-ladies-d', 'Ladies Hostel D', 'accommodation', 'ladies', 12.9708674, 79.16112, true),
  ('hostel-ladies-e', 'Ladies Hostel E', 'accommodation', 'ladies', 12.9708674, 79.16112, true),
  ('hostel-ladies-f', 'Ladies Hostel F', 'accommodation', 'ladies', 12.9708674, 79.16112, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key in ('hostel-ladies-d', 'hostel-ladies-e', 'hostel-ladies-f')
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
