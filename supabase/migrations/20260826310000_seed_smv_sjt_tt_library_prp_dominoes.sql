-- Phase 3A-2: seed SMV, SJT, TT (core building), correct EV Periyar
-- Library and PRP, and add a new Food catalog point (Dominoes Pizza).
--
-- Source: supplied directly by the project owner.
-- Point: SMV / Latitude 12.9691918 / Longitude 79.1568926
-- Point: SJT / Latitude 12.971368  / Longitude 79.163495
-- Point: TT (Technology Tower, core building) / Latitude 12.9700902 / Longitude 79.1579793
-- Point: EV Periyar Library / Latitude 12.9692504 / Longitude 79.1570887
--   Corrects the previously seeded value (12.9693226, 79.1568558) - the
--   owner confirmed the new value should be used.
-- Point: PRP / Latitude 12.9719322 / Longitude 79.1660942
--   Corrects the previously seeded value (12.9714153, 79.1662525) - the
--   owner confirmed the new value should be used.
-- Point: Dominoes Pizza / Latitude 12.9711677 / Longitude 79.1633116
--   A new Food-category point, not part of the original approved catalog
--   (PHASE3_3A_LOCATION_SPEC.md §9) - added directly on the owner's
--   instruction ("put that under food").
--
-- STATUS: prepared in the repo. Applied to STAGING only
-- (wemjskpbulebxgyhyhmk), never production (kjsseqlmnmiuqepfmldh).

update campus_points set lat = 12.9691918, lng = 79.1568926, active = true where key = 'smv';
update campus_points set lat = 12.971368, lng = 79.163495, active = true where key = 'sjt-block';
update campus_points set lat = 12.9700902, lng = 79.1579793, active = true where key = 'tt-block';
update campus_points set lat = 12.9692504, lng = 79.1570887 where key = 'central-library';
update campus_points set lat = 12.9719322, lng = 79.1660942 where key = 'prp';

insert into campus_points (key, label, kind, lat, lng, active)
values ('dominoes-pizza', 'Dominoes Pizza', 'food', 12.9711677, 79.1633116, true)
on conflict (key) do nothing;

update campus_points cp
set nearest_path_node_id = nearest.node_id,
    nearest_path_node_distance_km = nearest.dist
from (
  select cp2.id as point_id, n.id as node_id, haversine_km(cp2.lat, cp2.lng, n.lat, n.lng) as dist,
         row_number() over (partition by cp2.id order by haversine_km(cp2.lat, cp2.lng, n.lat, n.lng)) as rn
  from campus_points cp2
  cross join campus_path_nodes n
  where cp2.key in ('smv', 'sjt-block', 'tt-block', 'central-library', 'prp', 'dominoes-pizza')
    and cp2.lat is not null
) nearest
where nearest.point_id = cp.id and nearest.rn = 1;
