-- Phase 3A-2: seed the real, physically distinct "Men's Hostel A" location.
--
-- Source: supplied directly by the project owner.
-- Point: Men's Hostel A
-- Latitude: 12.9728603
-- Longitude: 79.1571792
--
-- New row, not a reuse of any existing "Block A" row (none exists) or any
-- other point - see PHASE3_3A_LOCATION_SPEC.md §9a. wing = 'mens' is real
-- geographic identity, confirmed by the coordinate itself being distinct
-- from wherever Ladies Hostel A turns out to be.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, wing, lat, lng, active)
values ('hostel-mens-a', 'Men''s Hostel A', 'accommodation', 'mens', 12.9728603, 79.1571792, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'hostel-mens-a'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
