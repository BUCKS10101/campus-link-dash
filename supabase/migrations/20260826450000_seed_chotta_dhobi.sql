-- Phase 3A-2: add a new Shops catalog point (Main Chotta Dhobi Branch).
--
-- Source: supplied directly by the project owner.
-- Point: Main Chotta Dhobi Branch / Latitude 12.972243686504571 / Longitude 79.15873232118946
--   A new Shops-category point, not part of the original approved
--   catalog (PHASE3_3A_LOCATION_SPEC.md §9) - added directly on the
--   owner's instruction (category confirmed as Shops).
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

insert into campus_points (key, label, kind, lat, lng, active)
values ('chotta-dhobi-main', 'Main Chotta Dhobi Branch', 'shop', 12.972243686504571, 79.15873232118946, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key = 'chotta-dhobi-main'
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
