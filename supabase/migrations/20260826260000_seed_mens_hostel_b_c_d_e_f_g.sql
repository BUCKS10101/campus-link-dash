-- Phase 3A-2: seed the real, physically distinct Men's Hostel B, C, D,
-- D Annexe, E, F, and G locations.
--
-- Source: supplied directly by the project owner.
-- Point: Men's Hostel B / Latitude 12.9739175 / Longitude 79.1576353
-- Point: Men's Hostel C / Latitude 12.972832  / Longitude 79.158289
-- Point: Men's Hostel D / Latitude 12.972732  / Longitude 79.158846
-- Point: Men's Hostel D Annexe / Latitude 12.973192 / Longitude 79.159176
-- Point: Men's Hostel E / Latitude 12.972649  / Longitude 79.159782
-- Point: Men's Hostel F / Latitude 12.9738601 / Longitude 79.1578854
-- Point: Men's Hostel G / Latitude 12.9735188 / Longitude 79.1595773
--
-- New rows, not a reuse of the existing 'hostel-block-b'/'-c'/'-d'/'-e'/
-- '-f'/'-g' rows (those are separate, unconfirmed-wing "Block" points -
-- see PHASE3_3A_LOCATION_SPEC.md §9a - and are untouched by this
-- migration; 'hostel-block-c' no longer exists, having been deleted as a
-- never-coordinated placeholder in a prior migration this pass).
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, wing, lat, lng, active)
values
  ('hostel-mens-b', 'Men''s Hostel B', 'accommodation', 'mens', 12.9739175, 79.1576353, true),
  ('hostel-mens-c', 'Men''s Hostel C', 'accommodation', 'mens', 12.972832, 79.158289, true),
  ('hostel-mens-d', 'Men''s Hostel D', 'accommodation', 'mens', 12.972732, 79.158846, true),
  ('hostel-mens-d-annexe', 'Men''s Hostel D Annexe', 'accommodation', 'mens', 12.973192, 79.159176, true),
  ('hostel-mens-e', 'Men''s Hostel E', 'accommodation', 'mens', 12.972649, 79.159782, true),
  ('hostel-mens-f', 'Men''s Hostel F', 'accommodation', 'mens', 12.9738601, 79.1578854, true),
  ('hostel-mens-g', 'Men''s Hostel G', 'accommodation', 'mens', 12.9735188, 79.1595773, true)
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
    'hostel-mens-b', 'hostel-mens-c', 'hostel-mens-d', 'hostel-mens-d-annexe',
    'hostel-mens-e', 'hostel-mens-f', 'hostel-mens-g'
  )
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
