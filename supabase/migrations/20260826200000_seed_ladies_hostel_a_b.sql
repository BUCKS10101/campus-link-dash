-- Phase 3A-2: seed the real, physically distinct "Ladies Hostel A" and
-- "Ladies Hostel B" locations.
--
-- Source: supplied directly by the project owner.
-- Point: Ladies Hostel A / Ladies Hostel B
-- Latitude: 12.9683973
-- Longitude: 79.1581136
--
-- The two buildings sit right next to each other and share one entrance
-- (confirmed by the project owner), so both points intentionally resolve
-- to the same coordinate - not a data error, not a guess. New rows, not a
-- reuse of the existing 'hostel-block-b' row (that row is a separate,
-- unconfirmed-wing "Block B" seeded earlier - see
-- PHASE3_3A_LOCATION_SPEC.md §9a - and is untouched by this migration).
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, wing, lat, lng, active)
values
  ('hostel-ladies-a', 'Ladies Hostel A', 'accommodation', 'ladies', 12.9683973, 79.1581136, true),
  ('hostel-ladies-b', 'Ladies Hostel B', 'accommodation', 'ladies', 12.9683973, 79.1581136, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key in ('hostel-ladies-a', 'hostel-ladies-b')
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
