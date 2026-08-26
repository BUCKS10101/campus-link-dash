-- Phase 3A-2: add a new Shops catalog point (Main Dry Cleaning Shop).
--
-- Source: supplied directly by the project owner.
-- Point: Main Dry Cleaning Shop / Latitude 12.972315976217141 / Longitude 79.15959017493336
--   A new Shops-category point, not part of the original approved
--   catalog (PHASE3_3A_LOCATION_SPEC.md §9) - added directly on the
--   owner's instruction, same treatment as Main Chotta Dhobi Branch in
--   this same batch.
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, lat, lng, active)
values ('dry-cleaning-main', 'Main Dry Cleaning Shop', 'shop', 12.972315976217141, 79.15959017493336, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'dry-cleaning-main'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
