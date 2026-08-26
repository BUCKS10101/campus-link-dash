-- Phase 3A-2: seed the real, physically distinct Men's Hostel J location.
--
-- Source: Google Maps, supplied directly by the project owner.
-- Point: Men's Hostel J
-- Latitude: 12.972298
-- Longitude: 79.158091
--
-- New row, not a reuse of the existing 'hostel-block-j' row (that row is
-- a separate, unconfirmed-wing "Block J" with its own different
-- coordinate - see PHASE3_3A_LOCATION_SPEC.md §9a - and is untouched by
-- this migration), and not the same as 'hostel-ladies-j' (Ladies Hostel J
-- shares a coordinate with Ladies Hostel G/H, a different building).
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, wing, lat, lng, active)
values ('hostel-mens-j', 'Men''s Hostel J', 'accommodation', 'mens', 12.972298, 79.158091, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'hostel-mens-j'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
