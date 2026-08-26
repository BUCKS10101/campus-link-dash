-- Phase 3A-2: seed the real, physically distinct Men's Hostel K, L, M, N,
-- P, Q, R, and T locations.
--
-- Source: supplied directly by the project owner.
-- Point: Men's Hostel K / Latitude 12.9727675 / Longitude 79.1614224
-- Point: Men's Hostel L / Latitude 12.9727623 / Longitude 79.1623961
-- Point: Men's Hostel M / Latitude 12.9730334 / Longitude 79.1631864
-- Point: Men's Hostel R / Latitude 12.9731082 / Longitude 79.1633293
-- Point: Men's Hostel Q / Latitude 12.973882  / Longitude 79.163952
-- Point: Men's Hostel P / Latitude 12.974014  / Longitude 79.164187
-- Point: Men's Hostel N / Latitude 12.975105  / Longitude 79.163701
-- Point: Men's Hostel T / Latitude 12.9741135 / Longitude 79.1660211
--
-- The project owner also confirmed this is the FULL remaining men's-wing
-- inventory: no other letter has a separate men's building.
--
-- New rows, not a reuse of the existing 'hostel-block-n'/'-p'/'-t' rows
-- (those are separate, unconfirmed-wing "Block" points with their own
-- different coordinates - see PHASE3_3A_LOCATION_SPEC.md §9a - and are
-- untouched by this migration). No 'hostel-block-k'/'-l'/'-m'/'-q'/'-r'
-- rows exist to reuse - they were already deleted as never-coordinated
-- placeholders in a prior migration this pass.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, wing, lat, lng, active)
values
  ('hostel-mens-k', 'Men''s Hostel K', 'accommodation', 'mens', 12.9727675, 79.1614224, true),
  ('hostel-mens-l', 'Men''s Hostel L', 'accommodation', 'mens', 12.9727623, 79.1623961, true),
  ('hostel-mens-m', 'Men''s Hostel M', 'accommodation', 'mens', 12.9730334, 79.1631864, true),
  ('hostel-mens-r', 'Men''s Hostel R', 'accommodation', 'mens', 12.9731082, 79.1633293, true),
  ('hostel-mens-q', 'Men''s Hostel Q', 'accommodation', 'mens', 12.973882, 79.163952, true),
  ('hostel-mens-p', 'Men''s Hostel P', 'accommodation', 'mens', 12.974014, 79.164187, true),
  ('hostel-mens-n', 'Men''s Hostel N', 'accommodation', 'mens', 12.975105, 79.163701, true),
  ('hostel-mens-t', 'Men''s Hostel T', 'accommodation', 'mens', 12.9741135, 79.1660211, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key in (
    'hostel-mens-k', 'hostel-mens-l', 'hostel-mens-m', 'hostel-mens-r',
    'hostel-mens-q', 'hostel-mens-p', 'hostel-mens-n', 'hostel-mens-t'
  )
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
